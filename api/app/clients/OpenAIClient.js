const OpenAI = require('openai');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { encoding_for_model: encodingForModel, get_encoding: getEncoding } = require('tiktoken');
const { getResponseSender, EModelEndpoint } = require('librechat-data-provider');
const { encodeAndFormat, validateVisionModel } = require('~/server/services/Files/images');
const { getModelMaxTokens, genAzureChatCompletion, extractBaseURL } = require('~/utils');
const { truncateText, formatMessage, CUT_OFF_PROMPT } = require('./prompts');
const { handleOpenAIErrors } = require('./tools/util');
const spendTokens = require('~/models/spendTokens');
const { createLLM, RunManager } = require('./llm');
const { isEnabled } = require('~/server/utils');
const ChatGPTClient = require('./ChatGPTClient');
const { summaryBuffer } = require('./memory');
const { runTitleChain } = require('./chains');
const { tokenSplit } = require('./document');
const BaseClient = require('./BaseClient');

// Cache to store Tiktoken instances
const tokenizersCache = {};
// Counter for keeping track of the number of tokenizer calls
let tokenizerCallsCount = 0;

class OpenAIClient extends BaseClient {
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    this.ChatGPTClient = new ChatGPTClient();
    this.buildPrompt = this.ChatGPTClient.buildPrompt.bind(this);
    this.getCompletion = this.ChatGPTClient.getCompletion.bind(this);
    this.contextStrategy = options.contextStrategy
      ? options.contextStrategy.toLowerCase()
      : 'discard';
    this.shouldSummarize = this.contextStrategy === 'summarize';
    this.azure = options.azure || false;
    this.setOptions(options);
  }

  // TODO: PluginsClient calls this 3x, unneeded
  setOptions(options) {
    if (this.options && !this.options.replaceOptions) {
      this.options.modelOptions = {
        ...this.options.modelOptions,
        ...options.modelOptions,
      };
      delete options.modelOptions;
      this.options = {
        ...this.options,
        ...options,
      };
    } else {
      this.options = options;
    }

    if (this.options.openaiApiKey) {
      this.apiKey = this.options.openaiApiKey;
    }

    const modelOptions = this.options.modelOptions || {};

    if (!this.modelOptions) {
      this.modelOptions = {
        ...modelOptions,
        model: modelOptions.model || 'gpt-3.5-turbo',
        temperature:
          typeof modelOptions.temperature === 'undefined' ? 0.8 : modelOptions.temperature,
        top_p: typeof modelOptions.top_p === 'undefined' ? 1 : modelOptions.top_p,
        presence_penalty:
          typeof modelOptions.presence_penalty === 'undefined' ? 1 : modelOptions.presence_penalty,
        stop: modelOptions.stop,
      };
    } else {
      // Update the modelOptions if it already exists
      this.modelOptions = {
        ...this.modelOptions,
        ...modelOptions,
      };
    }

    if (this.options.attachments && !validateVisionModel(this.modelOptions.model)) {
      this.modelOptions.model = 'gpt-4-vision-preview';
    }

    if (validateVisionModel(this.modelOptions.model)) {
      delete this.modelOptions.stop;
    }

    const { OPENROUTER_API_KEY, OPENAI_FORCE_PROMPT } = process.env ?? {};
    if (OPENROUTER_API_KEY && !this.azure) {
      this.apiKey = OPENROUTER_API_KEY;
      this.useOpenRouter = true;
    }

    const { reverseProxyUrl: reverseProxy } = this.options;
    this.FORCE_PROMPT =
      isEnabled(OPENAI_FORCE_PROMPT) ||
      (reverseProxy && reverseProxy.includes('completions') && !reverseProxy.includes('chat'));

    if (this.azure && process.env.AZURE_OPENAI_DEFAULT_MODEL) {
      this.azureEndpoint = genAzureChatCompletion(this.azure, this.modelOptions.model);
      this.modelOptions.model = process.env.AZURE_OPENAI_DEFAULT_MODEL;
    } else if (this.azure) {
      this.azureEndpoint = genAzureChatCompletion(this.azure, this.modelOptions.model);
    }

    const { model } = this.modelOptions;

    this.isChatCompletion = this.useOpenRouter || !!reverseProxy || model.includes('gpt-');
    this.isChatGptModel = this.isChatCompletion;
    if (
      model.includes('text-davinci') ||
      model.includes('gpt-3.5-turbo-instruct') ||
      this.FORCE_PROMPT
    ) {
      this.isChatCompletion = false;
      this.isChatGptModel = false;
    }
    const { isChatGptModel } = this;
    this.isUnofficialChatGptModel =
      model.startsWith('text-chat') || model.startsWith('text-davinci-002-render');
    this.maxContextTokens = getModelMaxTokens(model) ?? 4095; // 1 less than maximum

    if (this.shouldSummarize) {
      this.maxContextTokens = Math.floor(this.maxContextTokens / 2);
    }

    if (this.options.debug) {
      console.debug('maxContextTokens', this.maxContextTokens);
    }

    this.maxResponseTokens = this.modelOptions.max_tokens || 1024;
    this.maxPromptTokens =
      this.options.maxPromptTokens || this.maxContextTokens - this.maxResponseTokens;

    if (this.maxPromptTokens + this.maxResponseTokens > this.maxContextTokens) {
      throw new Error(
        `maxPromptTokens + max_tokens (${this.maxPromptTokens} + ${this.maxResponseTokens} = ${
          this.maxPromptTokens + this.maxResponseTokens
        }) must be less than or equal to maxContextTokens (${this.maxContextTokens})`,
      );
    }

    this.sender =
      this.options.sender ??
      getResponseSender({
        model: this.modelOptions.model,
        endpoint: EModelEndpoint.openAI,
        chatGptLabel: this.options.chatGptLabel,
      });

    this.userLabel = this.options.userLabel || 'User';
    this.chatGptLabel = this.options.chatGptLabel || 'Assistant';

    this.setupTokens();

    if (!this.modelOptions.stop && !validateVisionModel(this.modelOptions.model)) {
      const stopTokens = [this.startToken];
      if (this.endToken && this.endToken !== this.startToken) {
        stopTokens.push(this.endToken);
      }
      stopTokens.push(`\n${this.userLabel}:`);
      stopTokens.push('<|diff_marker|>');
      this.modelOptions.stop = stopTokens;
    }

    if (reverseProxy) {
      this.completionsUrl = reverseProxy;
      this.langchainProxy = extractBaseURL(reverseProxy);
    } else if (isChatGptModel) {
      this.completionsUrl = 'https://api.openai.com/v1/chat/completions';
    } else {
      this.completionsUrl = 'https://api.openai.com/v1/completions';
    }

    if (this.azureEndpoint) {
      this.completionsUrl = this.azureEndpoint;
    }

    if (this.azureEndpoint && this.options.debug) {
      console.debug('Using Azure endpoint');
    }

    if (this.useOpenRouter) {
      this.completionsUrl = 'https://openrouter.ai/api/v1/chat/completions';
    }

    return this;
  }

  setupTokens() {
    if (this.isChatCompletion) {
      this.startToken = '||>';
      this.endToken = '';
    } else if (this.isUnofficialChatGptModel) {
      this.startToken = '<|im_start|>';
      this.endToken = '<|im_end|>';
    } else {
      this.startToken = '||>';
      this.endToken = '';
    }
  }

  // Selects an appropriate tokenizer based on the current configuration of the client instance.
  // It takes into account factors such as whether it's a chat completion, an unofficial chat GPT model, etc.
  selectTokenizer() {
    let tokenizer;
    this.encoding = 'text-davinci-003';
    if (this.isChatCompletion) {
      this.encoding = 'cl100k_base';
      tokenizer = this.constructor.getTokenizer(this.encoding);
    } else if (this.isUnofficialChatGptModel) {
      const extendSpecialTokens = {
        '<|im_start|>': 100264,
        '<|im_end|>': 100265,
      };
      tokenizer = this.constructor.getTokenizer(this.encoding, true, extendSpecialTokens);
    } else {
      try {
        const { model } = this.modelOptions;
        this.encoding = model.includes('instruct') ? 'text-davinci-003' : model;
        tokenizer = this.constructor.getTokenizer(this.encoding, true);
      } catch {
        tokenizer = this.constructor.getTokenizer('text-davinci-003', true);
      }
    }

    return tokenizer;
  }

  // Retrieves a tokenizer either from the cache or creates a new one if one doesn't exist in the cache.
  // If a tokenizer is being created, it's also added to the cache.
  static getTokenizer(encoding, isModelName = false, extendSpecialTokens = {}) {
    let tokenizer;
    if (tokenizersCache[encoding]) {
      tokenizer = tokenizersCache[encoding];
    } else {
      if (isModelName) {
        tokenizer = encodingForModel(encoding, extendSpecialTokens);
      } else {
        tokenizer = getEncoding(encoding, extendSpecialTokens);
      }
      tokenizersCache[encoding] = tokenizer;
    }
    return tokenizer;
  }

  // Frees all encoders in the cache and resets the count.
  static freeAndResetAllEncoders() {
    try {
      Object.keys(tokenizersCache).forEach((key) => {
        if (tokenizersCache[key]) {
          tokenizersCache[key].free();
          delete tokenizersCache[key];
        }
      });
      // Reset count
      tokenizerCallsCount = 1;
    } catch (error) {
      console.log('Free and reset encoders error');
      console.error(error);
    }
  }

  // Checks if the cache of tokenizers has reached a certain size. If it has, it frees and resets all tokenizers.
  resetTokenizersIfNecessary() {
    if (tokenizerCallsCount >= 25) {
      if (this.options.debug) {
        console.debug('freeAndResetAllEncoders: reached 25 encodings, resetting...');
      }
      this.constructor.freeAndResetAllEncoders();
    }
    tokenizerCallsCount++;
  }

  // Returns the token count of a given text. It also checks and resets the tokenizers if necessary.
  getTokenCount(text) {
    this.resetTokenizersIfNecessary();
    try {
      const tokenizer = this.selectTokenizer();
      return tokenizer.encode(text, 'all').length;
    } catch (error) {
      this.constructor.freeAndResetAllEncoders();
      const tokenizer = this.selectTokenizer();
      return tokenizer.encode(text, 'all').length;
    }
  }

  getSaveOptions() {
    return {
      chatGptLabel: this.options.chatGptLabel,
      promptPrefix: this.options.promptPrefix,
      ...this.modelOptions,
    };
  }

  getBuildMessagesOptions(opts) {
    return {
      isChatCompletion: this.isChatCompletion,
      promptPrefix: opts.promptPrefix,
      abortController: opts.abortController,
    };
  }

  async buildMessages(
    messages,
    parentMessageId,
    { isChatCompletion = false, promptPrefix = null },
    opts,
  ) {
    let orderedMessages = this.constructor.getMessagesForConversation({
      messages,
      parentMessageId,
      summary: this.shouldSummarize,
    });
    if (!isChatCompletion) {
      return await this.buildPrompt(orderedMessages, {
        isChatGptModel: isChatCompletion,
        promptPrefix,
      });
    }

    let payload;
    let instructions;
    let tokenCountMap;
    let promptTokens;

    promptPrefix = (promptPrefix || this.options.promptPrefix || '').trim();
    if (promptPrefix) {
      promptPrefix = `Instructions:\n${promptPrefix}`;
      instructions = {
        role: 'system',
        name: 'instructions',
        content: promptPrefix,
      };

      if (this.contextStrategy) {
        instructions.tokenCount = this.getTokenCountForMessage(instructions);
      }
    }

    if (this.options.attachments) {
      const attachments = await this.options.attachments;
      const { files, image_urls } = await encodeAndFormat(
        this.options.req,
        attachments.filter((file) => file.type.includes('image')),
      );

      orderedMessages[orderedMessages.length - 1].image_urls = image_urls;
      this.options.attachments = files;
    }

    const formattedMessages = orderedMessages.map((message, i) => {
      const formattedMessage = formatMessage({
        message,
        userName: this.options?.name,
        assistantName: this.options?.chatGptLabel,
      });

      if (this.contextStrategy && !orderedMessages[i].tokenCount) {
        orderedMessages[i].tokenCount = this.getTokenCountForMessage(formattedMessage);
      }

      return formattedMessage;
    });

    // TODO: need to handle interleaving instructions better
    if (this.contextStrategy) {
      ({ payload, tokenCountMap, promptTokens, messages } = await this.handleContextStrategy({
        instructions,
        orderedMessages,
        formattedMessages,
      }));
    }

    const result = {
      prompt: payload,
      promptTokens,
      messages,
    };

    if (tokenCountMap) {
      tokenCountMap.instructions = instructions?.tokenCount;
      result.tokenCountMap = tokenCountMap;
    }

    if (promptTokens >= 0 && typeof opts?.getReqData === 'function') {
      opts.getReqData({ promptTokens });
    }

    return result;
  }

  async sendCompletion(payload, opts = {}) {
    let reply = '';
    let result = null;
    let streamResult = null;
    this.modelOptions.user = this.user;
    const invalidBaseUrl = this.completionsUrl && extractBaseURL(this.completionsUrl) === null;
    const useOldMethod = !!(this.azure || invalidBaseUrl || !this.isChatCompletion);
    if (typeof opts.onProgress === 'function' && useOldMethod) {
      await this.getCompletion(
        payload,
        (progressMessage) => {
          if (progressMessage === '[DONE]') {
            return;
          }

          if (this.options.debug) {
            // console.debug('progressMessage');
            // console.dir(progressMessage, { depth: null });
          }

          if (progressMessage.choices) {
            streamResult = progressMessage;
          }

          let token = null;
          if (this.isChatCompletion) {
            token =
              progressMessage.choices?.[0]?.delta?.content ?? progressMessage.choices?.[0]?.text;
          } else {
            token = progressMessage.choices?.[0]?.text;
          }

          if (!token && this.useOpenRouter) {
            token = progressMessage.choices?.[0]?.message?.content;
          }
          // first event's delta content is always undefined
          if (!token) {
            return;
          }
          if (this.options.debug) {
            // console.debug(token);
          }
          if (token === this.endToken) {
            return;
          }
          opts.onProgress(token);
          reply += token;
        },
        opts.abortController || new AbortController(),
      );
    } else if (typeof opts.onProgress === 'function') {
      reply = await this.chatCompletion({
        payload,
        clientOptions: opts,
        onProgress: opts.onProgress,
        abortController: opts.abortController,
      });
    } else {
      result = await this.getCompletion(
        payload,
        null,
        opts.abortController || new AbortController(),
      );
      if (this.options.debug) {
        console.debug(JSON.stringify(result));
      }
      if (this.isChatCompletion) {
        reply = result.choices[0].message.content;
      } else {
        reply = result.choices[0].text.replace(this.endToken, '');
      }
    }

    if (streamResult && typeof opts.addMetadata === 'function') {
      const { finish_reason } = streamResult.choices[0];
      opts.addMetadata({ finish_reason });
    }
    return reply.trim();
  }

  initializeLLM({
    model = 'gpt-3.5-turbo',
    modelName,
    temperature = 0.2,
    presence_penalty = 0,
    frequency_penalty = 0,
    max_tokens,
    streaming,
    context,
    tokenBuffer,
    initialMessageCount,
  }) {
    const modelOptions = {
      modelName: modelName ?? model,
      temperature,
      presence_penalty,
      frequency_penalty,
      user: this.user,
    };

    if (max_tokens) {
      modelOptions.max_tokens = max_tokens;
    }

    const configOptions = {};

    if (this.langchainProxy) {
      configOptions.basePath = this.langchainProxy;
    }

    if (this.useOpenRouter) {
      configOptions.basePath = 'https://openrouter.ai/api/v1';
      configOptions.baseOptions = {
        headers: {
          'HTTP-Referer': 'https://librechat.ai',
          'X-Title': 'LibreChat',
        },
      };
    }

    if (this.options.proxy) {
      configOptions.httpAgent = new HttpsProxyAgent(this.options.proxy);
      configOptions.httpsAgent = new HttpsProxyAgent(this.options.proxy);
    }

    const { req, res, debug } = this.options;
    const runManager = new RunManager({ req, res, debug, abortController: this.abortController });
    this.runManager = runManager;

    const llm = createLLM({
      modelOptions,
      configOptions,
      openAIApiKey: this.apiKey,
      azure: this.azure,
      streaming,
      callbacks: runManager.createCallbacks({
        context,
        tokenBuffer,
        conversationId: this.conversationId,
        initialMessageCount,
      }),
    });

    return llm;
  }

  async titleConvo({ text, responseText = '' }) {
    let title = 'New Chat';
    const convo = `||>User:
"${truncateText(text)}"
||>Response:
"${JSON.stringify(truncateText(responseText))}"`;

    const { OPENAI_TITLE_MODEL } = process.env ?? {};

    const modelOptions = {
      model: OPENAI_TITLE_MODEL ?? 'gpt-3.5-turbo',
      temperature: 0.2,
      presence_penalty: 0,
      frequency_penalty: 0,
      max_tokens: 16,
    };

    try {
      this.abortController = new AbortController();
      const llm = this.initializeLLM({ ...modelOptions, context: 'title', tokenBuffer: 150 });
      title = await runTitleChain({ llm, text, convo, signal: this.abortController.signal });
    } catch (e) {
      if (e?.message?.toLowerCase()?.includes('abort')) {
        this.options.debug && console.debug('Aborted title generation');
        return;
      }
      console.log('There was an issue generating title with LangChain, trying the old method...');
      this.options.debug && console.error(e.message, e);
      modelOptions.model = OPENAI_TITLE_MODEL ?? 'gpt-3.5-turbo';
      if (this.azure) {
        modelOptions.model = process.env.AZURE_OPENAI_DEFAULT_MODEL ?? modelOptions.model;
        this.azureEndpoint = genAzureChatCompletion(this.azure, modelOptions.model);
      }
      const instructionsPayload = [
        {
          role: 'system',
          content: `Detect user language and write in the same language an extremely concise title for this conversation, which you must accurately detect.
Write in the detected language. Title in 5 Words or Less. No Punctuation or Quotation. Do not mention the language. All first letters of every word should be capitalized and write the title in User Language only.

${convo}

||>Title:`,
        },
      ];

      try {
        title = (await this.sendPayload(instructionsPayload, { modelOptions })).replaceAll('"', '');
      } catch (e) {
        console.error(e);
        console.log('There was another issue generating the title, see error above.');
      }
    }

    console.log('CONVERSATION TITLE', title);
    return title;
  }

  async summarizeMessages({ messagesToRefine, remainingContextTokens }) {
    this.options.debug && console.debug('Summarizing messages...');
    let context = messagesToRefine;
    let prompt;

    const { OPENAI_SUMMARY_MODEL = 'gpt-3.5-turbo' } = process.env ?? {};
    const maxContextTokens = getModelMaxTokens(OPENAI_SUMMARY_MODEL) ?? 4095;
    // 3 tokens for the assistant label, and 98 for the summarizer prompt (101)
    let promptBuffer = 101;

    /*
     * Note: token counting here is to block summarization if it exceeds the spend; complete
     * accuracy is not important. Actual spend will happen after successful summarization.
     */
    const excessTokenCount = context.reduce(
      (acc, message) => acc + message.tokenCount,
      promptBuffer,
    );

    if (excessTokenCount > maxContextTokens) {
      ({ context } = await this.getMessagesWithinTokenLimit(context, maxContextTokens));
    }

    if (context.length === 0) {
      this.options.debug &&
        console.debug('Summary context is empty, using latest message within token limit');

      promptBuffer = 32;
      const { text, ...latestMessage } = messagesToRefine[messagesToRefine.length - 1];
      const splitText = await tokenSplit({
        text,
        chunkSize: Math.floor((maxContextTokens - promptBuffer) / 3),
      });

      const newText = `${splitText[0]}\n...[truncated]...\n${splitText[splitText.length - 1]}`;
      prompt = CUT_OFF_PROMPT;

      context = [
        formatMessage({
          message: {
            ...latestMessage,
            text: newText,
          },
          userName: this.options?.name,
          assistantName: this.options?.chatGptLabel,
        }),
      ];
    }
    // TODO: We can accurately count the tokens here before handleChatModelStart
    // by recreating the summary prompt (single message) to avoid LangChain handling

    const initialPromptTokens = this.maxContextTokens - remainingContextTokens;
    this.options.debug && console.debug(`initialPromptTokens: ${initialPromptTokens}`);

    const llm = this.initializeLLM({
      model: OPENAI_SUMMARY_MODEL,
      temperature: 0.2,
      context: 'summary',
      tokenBuffer: initialPromptTokens,
    });

    try {
      const summaryMessage = await summaryBuffer({
        llm,
        debug: this.options.debug,
        prompt,
        context,
        formatOptions: {
          userName: this.options?.name,
          assistantName: this.options?.chatGptLabel ?? this.options?.modelLabel,
        },
        previous_summary: this.previous_summary?.summary,
        signal: this.abortController.signal,
      });

      const summaryTokenCount = this.getTokenCountForMessage(summaryMessage);

      if (this.options.debug) {
        console.debug('summaryMessage:', summaryMessage);
        console.debug(
          `remainingContextTokens: ${remainingContextTokens}, after refining: ${
            remainingContextTokens - summaryTokenCount
          }`,
        );
      }

      return { summaryMessage, summaryTokenCount };
    } catch (e) {
      if (e?.message?.toLowerCase()?.includes('abort')) {
        this.options.debug && console.debug('Aborted summarization');
        const { run, runId } = this.runManager.getRunByConversationId(this.conversationId);
        if (run && run.error) {
          const { error } = run;
          this.runManager.removeRun(runId);
          throw new Error(error);
        }
      }
      console.error('Error summarizing messages');
      this.options.debug && console.error(e);
      return {};
    }
  }

  async recordTokenUsage({ promptTokens, completionTokens }) {
    if (this.options.debug) {
      console.debug('promptTokens', promptTokens);
      console.debug('completionTokens', completionTokens);
    }
    await spendTokens(
      {
        user: this.user,
        model: this.modelOptions.model,
        context: 'message',
        conversationId: this.conversationId,
      },
      { promptTokens, completionTokens },
    );
  }

  getTokenCountForResponse(response) {
    return this.getTokenCountForMessage({
      role: 'assistant',
      content: response.text,
    });
  }

  async chatCompletion({ payload, onProgress, clientOptions, abortController = null }) {
    let error = null;
    const errorCallback = (err) => (error = err);
    let intermediateReply = '';
    try {
      if (!abortController) {
        abortController = new AbortController();
      }
      const modelOptions = { ...this.modelOptions };
      if (typeof onProgress === 'function') {
        modelOptions.stream = true;
      }
      if (this.isChatCompletion) {
        modelOptions.messages = payload;
      } else {
        // TODO: unreachable code. Need to implement completions call for non-chat models
        modelOptions.prompt = payload;
      }

      const { debug } = this.options;
      const url = extractBaseURL(this.completionsUrl);
      if (debug) {
        console.debug('baseURL', url);
        console.debug('modelOptions', modelOptions);
      }
      const opts = {
        baseURL: url,
      };

      if (this.useOpenRouter) {
        opts.defaultHeaders = {
          'HTTP-Referer': 'https://librechat.ai',
          'X-Title': 'LibreChat',
        };
      }

      if (this.options.headers) {
        opts.defaultHeaders = { ...opts.defaultHeaders, ...this.options.headers };
      }

      if (this.options.proxy) {
        opts.httpAgent = new HttpsProxyAgent(this.options.proxy);
      }

      if (validateVisionModel(modelOptions.model)) {
        modelOptions.max_tokens = 4000;
      }

      let chatCompletion;
      const openai = new OpenAI({
        apiKey: this.apiKey,
        ...opts,
      });

      let UnexpectedRoleError = false;
      if (modelOptions.stream) {
        const stream = await openai.beta.chat.completions
          .stream({
            ...modelOptions,
            stream: true,
          })
          .on('abort', () => {
            /* Do nothing here */
          })
          .on('error', (err) => {
            handleOpenAIErrors(err, errorCallback, 'stream');
          })
          .on('finalMessage', (message) => {
            if (message?.role !== 'assistant') {
              stream.messages.push({ role: 'assistant', content: intermediateReply });
              UnexpectedRoleError = true;
            }
          });

        for await (const chunk of stream) {
          const token = chunk.choices[0]?.delta?.content || '';
          intermediateReply += token;
          onProgress(token);
          if (abortController.signal.aborted) {
            stream.controller.abort();
            break;
          }
        }

        if (!UnexpectedRoleError) {
          chatCompletion = await stream.finalChatCompletion().catch((err) => {
            handleOpenAIErrors(err, errorCallback, 'finalChatCompletion');
          });
        }
      }
      // regular completion
      else {
        chatCompletion = await openai.chat.completions
          .create({
            ...modelOptions,
          })
          .catch((err) => {
            handleOpenAIErrors(err, errorCallback, 'create');
          });
      }

      if (!chatCompletion && UnexpectedRoleError) {
        throw new Error(
          'OpenAIError: Invalid final message: OpenAI expects final message to include role=assistant',
        );
      } else if (!chatCompletion && error) {
        throw new Error(error);
      } else if (!chatCompletion) {
        throw new Error('Chat completion failed');
      }

      const { message, finish_reason } = chatCompletion.choices[0];
      if (chatCompletion && typeof clientOptions.addMetadata === 'function') {
        clientOptions.addMetadata({ finish_reason });
      }

      return message.content;
    } catch (err) {
      if (
        err?.message?.includes('abort') ||
        (err instanceof OpenAI.APIError && err?.message?.includes('abort'))
      ) {
        return '';
      }
      if (
        err?.message?.includes(
          'OpenAIError: Invalid final message: OpenAI expects final message to include role=assistant',
        ) ||
        err?.message?.includes('The server had an error processing your request') ||
        err?.message?.includes('missing finish_reason') ||
        (err instanceof OpenAI.OpenAIError && err?.message?.includes('missing finish_reason'))
      ) {
        console.error(err);
        await abortController.abortCompletion();
        return intermediateReply;
      } else if (err instanceof OpenAI.APIError) {
        console.log(err.name);
        console.log(err.status);
        console.log(err.headers);
        if (intermediateReply) {
          return intermediateReply;
        } else {
          throw err;
        }
      } else {
        console.warn('[OpenAIClient.chatCompletion] Unhandled error type');
        console.error(err);
        throw err;
      }
    }
  }
}

module.exports = OpenAIClient;
