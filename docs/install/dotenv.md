# .env File Configuration
Welcome to the comprehensive guide for configuring your application's environment with the `.env` file. This document is your one-stop resource for understanding and customizing the environment variables that will shape your application's behavior in different contexts.

While the default settings provide a solid foundation for a standard `docker` installation, delving into this guide will unveil the full potential of LibreChat. This guide empowers you to tailor LibreChat to your precise needs. Discover how to adjust language model availability, integrate social logins, manage the automatic moderation system, and much more. It's all about giving you the control to fine-tune LibreChat for an optimal user experience.

## Server Configuration

### Customization
- Here you can change the app title and footer
- Uncomment to add a custom footer.
    - Uncomment and make empty "" to remove the footer.

```bash
APP_TITLE=LibreChat
CUSTOM_FOOTER="My custom footer"
```

### Port

- The server will listen to localhost:3080 by default. You can change the target IP as you want. If you want to make this server available externally, for example to share the server with others or expose this from a Docker container, set host to 0.0.0.0 or your external IP interface. 

> Tips: Setting host to 0.0.0.0 means listening on all interfaces. It's not a real IP.

- Use localhost:port rather than 0.0.0.0:port to access the server.

```bash
HOST=localhost
PORT=3080
```

### MongoDB Database

- Change this to your MongoDB URI if different. It is recommend to append LibreChat.
- Instruction on how to create an online MongoDB database (useful for use without docker):
    - [Online MongoDB](./mongodb.md)
- Securely access your docker MongoDB database:
    - [Manage your database](../features/manage_your_database.md)

```bash
MONGO_URI=mongodb://127.0.0.1:27018/LibreChat
```

### Application Domains

- To use LibreChat locally, set `DOMAIN_CLIENT` and `DOMAIN_SERVER` to `http://localhost:3080` (3080 being the port previously configured)
- When deploying LibreChat to a custom domain, set `DOMAIN_CLIENT` and `DOMAIN_SERVER` to your deployed URL, e.g. `https://librechat.example.com` 

```bash
DOMAIN_CLIENT=http://localhost:3080
DOMAIN_SERVER=http://localhost:3080
```

### Permission
> UID and GID are numbers assigned by Linux to each user and group on the system. If you have permission problems, set here the UID and GID of the user running the docker compose command. The applications in the container will run with these uid/gid.

```bash
UID=1000
GID=1000
```

## Endpoints
In this section you can configure the endpoints and models selection, their API keys, and the proxy and reverse proxy settings for the endpoints that support it. 

### General Config
- Uncomment `ENDPOINTS` to customize the available endpoints in LibreChat
- `PROXY` is to be used by all endpoints (leave blank by default)

```bash
ENDPOINTS=openAI,azureOpenAI,bingAI,chatGPTBrowser,google,gptPlugins,anthropic
PROXY=
```

### Anthropic
see: [Anthropic Endpoint](./apis_and_tokens.md#anthropic-endpoint-claude)
- You can request an access key from https://console.anthropic.com/
- Leave `ANTHROPIC_API_KEY=` blank to disable this endpoint
- Set `ANTHROPIC_API_KEY=` to "user_provided" to allow users to provide their own API key from the WebUI
- If you have access to a reverse proxy for `Anthropic`, you can set it with `ANTHROPIC_REVERSE_PROXY=`
    - leave blank or comment it out to use default base url

```bash
ANTHROPIC_API_KEY=user_provided
ANTHROPIC_MODELS=claude-1,claude-instant-1,claude-2
ANTHROPIC_REVERSE_PROXY=
```

### Azure
see: [Azure OpenAI](./apis_and_tokens.md#azure-openai)

- To use Azure with this project, set the following variables. These will be used to build the API URL.

```bash
AZURE_API_KEY=
AZURE_OPENAI_API_INSTANCE_NAME=
AZURE_OPENAI_API_DEPLOYMENT_NAME=
AZURE_OPENAI_API_VERSION=
AZURE_OPENAI_API_COMPLETIONS_DEPLOYMENT_NAME=
AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME=
```
> Note: As of 2023-11-10, the Azure API only allows one model per deployment,

- Chat completion: `https://{AZURE_OPENAI_API_INSTANCE_NAME}.openai.azure.com/openai/deployments/{AZURE_OPENAI_API_DEPLOYMENT_NAME}/chat/completions?api-version={AZURE_OPENAI_API_VERSION}`
- You should also consider changing the `OPENAI_MODELS` variable to the models available in your instance/deployment.

> Note: `AZURE_OPENAI_API_COMPLETIONS_DEPLOYMENT_NAME` and `AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME` are optional but might be used in the future

- It's recommended to name your deployments after the model name, e.g. `gpt-35-turbo,` which allows for fast deployment switching and `AZURE_USE_MODEL_AS_DEPLOYMENT_NAME` **enabled**. However, you can use non-model deployment names and setting the `AZURE_OPENAI_DEFAULT_MODEL` to ensure it works as expected.

- Identify the available models, separated by commas *without spaces*. The first will be default. Leave it blank or as is to use internal settings.

> Note: as deployment names can't have periods, they will be removed when the endpoint is generated.

```bash
AZURE_OPENAI_MODELS=gpt-3.5-turbo,gpt-4
```

- This enables the use of the model name as the deployment name, e.g. "gpt-3.5-turbo" as the deployment name **(Advanced)**

```bash
AZURE_USE_MODEL_AS_DEPLOYMENT_NAME=TRUE
```

- To use Azure with the Plugins endpoint, you need the variables above, and uncomment the following variable:

> Note: This may not work as expected and Azure OpenAI may not support OpenAI Functions yet
> Omit/leave it commented to use the default OpenAI API

```bash 
PLUGINS_USE_AZURE="true"
```

### BingAI
Bing, also used for Sydney, jailbreak, and Bing Image Creator, see: [Bing Access token](./apis_and_tokens.md#bing-access-token) and [Bing Jailbreak](../features/bing_jailbreak.md)

- Follow these instructions to get your bing access token (it's best to use the full cookie string for that purpose): [Bing Access Token](https://github.com/danny-avila/LibreChat/issues/370#issuecomment-1560382302)  
- Leave `BINGAI_TOKEN=` blank to disable this endpoint
- Set `BINGAI_TOKEN=` to "user_provided" to allow users to provide their own API key from the WebUI

> Note: It is recommended to leave it as "user_provided" and provide the token from the WebUI.

- `BINGAI_HOST` can be necessary for some people in different countries, e.g. China (https://cn.bing.com). Leave it blank or commented out to use default server.

```bash
BINGAI_TOKEN=user_provided
BINGAI_HOST=
```

### ChatGPT
see: [ChatGPT Free Access token](./apis_and_tokens.md#chatgpt-free-access-token)

> **Warning**: To use this endpoint you'll have to set up your own reverse proxy. Here is the installation guide to deploy your own (based on [PandoraNext](https://github.com/pandora-next/deploy)): **[PandoraNext Deployment Guide](../features/pandoranext.md)**

```bash
CHATGPT_REVERSE_PROXY=<YOUR-REVERSE-PROXY>
```

> ~~Note: If you're a GPT plus user you can add gpt-4, gpt-4-plugins, gpt-4-code-interpreter, and gpt-4-browsing to the list above and use the models for these features; however, the view/display portion of these features are not supported, but you can use the underlying models, which have higher token context~~
> **Note:** The current method only works with `text-davinci-002-render-sha`

- Leave `CHATGPT_TOKEN=` blank to disable this endpoint
- Set `CHATGPT_TOKEN=` to "user_provided" to allow users to provide their own API key from the WebUI
    - It is not recommended to provide your token in the `.env` file since it expires often and sharing it could get you banned.

```bash
CHATGPT_TOKEN=
CHATGPT_MODELS=text-davinci-002-render-sha
```

### Google
Follow these instruction to setup: [Google LLMs](./apis_and_tokens.md#google-llms)

```bash
GOOGLE_KEY=user_provided
GOOGLE_REVERSE_PROXY=
```

### OpenAI

- To get your OpenAI API key, you need to:
    - Go to https://platform.openai.com/account/api-keys
    - Create an account or log in with your existing one
    - Add a payment method to your account (this is not free, sorry 😬)
    - Copy your secret key (sk-...) to `OPENAI_API_KEY`

- Leave `OPENAI_API_KEY=` blank to disable this endpoint
- Set `OPENAI_API_KEY=` to "user_provided" to allow users to provide their own API key from the WebUI

```bash
OPENAI_API_KEY=user_provided
```

- Set to true to enable debug mode for the OpenAI endpoint

```bash
DEBUG_OPENAI=false
```

- Customize the available models, separated by commas, **without spaces**.
    - The first will be default.
    - Leave it blank or commented out to use internal settings.

```bash
OPENAI_MODELS=gpt-3.5-turbo-1106,gpt-4-1106-preview,gpt-3.5-turbo,gpt-3.5-turbo-16k,gpt-3.5-turbo-0301,text-davinci-003,gpt-4,gpt-4-0314,gpt-4-0613
```

- Titling is enabled by default when initiating a conversation.
    - Set to false to disable this feature.

```bash
TITLE_CONVO=true
```

- The default model used for titling by is gpt-3.5-turbo. You can change it by uncommenting the following and setting the desired model. **(Optional)** 

> **Note:** Must be compatible with the OpenAI Endpoint.

```bash
OPENAI_TITLE_MODEL=gpt-3.5-turbo
```

- Enable message summarization by uncommenting the following **(Optional/Experimental)** 

> **Note:** this may affect response time when a summary is being generated.

```bash
OPENAI_SUMMARIZE=true
```

> **Not yet implemented**: this will be a conversation option enabled by default to save users on tokens. We are using the ConversationSummaryBufferMemory method to summarize messages. To learn more about this, see this article: [https://www.pinecone.io/learn/series/langchain/langchain-conversational-memory/](https://www.pinecone.io/learn/series/langchain/langchain-conversational-memory/)

- Reverse proxy settings for OpenAI:
    - see: [LiteLLM](./litellm.md) 
    - see also: [Free AI APIs](./free_ai_apis.md#nagaai)

```bash
OPENAI_REVERSE_PROXY=
```

- Sometimes when using Local LLM APIs, you may need to force the API to be called with a `prompt` payload instead of a `messages` payload; to mimic the `/v1/completions` request instead of `/v1/chat/completions`. This may be the case for LocalAI with some models. To do so, uncomment the following **(Advanced)** 

```bash
OPENAI_FORCE_PROMPT=true
```

### OpenRouter
See [OpenRouter](./free_ai_apis.md#openrouter-preferred) for more info.

- OpenRouter is a legitimate proxy service to a multitude of LLMs, both closed and open source, including: OpenAI models, Anthropic models, Meta's Llama models, pygmalionai/mythalion-13b and many more open source models. Newer integrations are usually discounted, too!

> Note: this overrides the OpenAI and Plugins Endpoints.

```bash
OPENROUTER_API_KEY=
```

### Plugins
Here are some useful documentation about plugins:

- [Introduction](../features/plugins/introduction.md)
- [Make Your Own](../features/plugins/make_your_own.md)
- [Using official ChatGPT Plugins](../features/plugins/chatgpt_plugins_openapi.md)

#### General Configuration:
- Identify the available models, separated by commas **without spaces**. The first model in the list will be set as default. Leave it blank or commented out to use internal settings.

```bash
PLUGIN_MODELS=gpt-3.5-turbo,gpt-3.5-turbo-16k,gpt-3.5-turbo-0301,gpt-4,gpt-4-0314,gpt-4-0613
```

- Set to false or comment out to disable debug mode for plugins

```bash
DEBUG_PLUGINS=true
```

- For securely storing credentials, you need a fixed key and IV. You can set them here for prod and dev environments.
    - You need a 32-byte key (64 characters in hex) and 16-byte IV (32 characters in hex) You can use this replit to generate some quickly: [Key Generator](https://replit.com/@daavila/crypto#index.js)

> Warning: If you don't set them, the app will crash on startup.

```bash
CREDS_KEY=f34be427ebb29de8d88c107a71546019685ed8b241d8f2ed00c3df97ad2566f0
CREDS_IV=e2341419ec3dd3d19b13a1a87fafcbfb
```

#### Azure AI Search
This plugin supports searching Azure AI Search for answers to your questions. See: [Azure AI Search](../features/plugins/azure_ai_search.md)

```bash
AZURE_AI_SEARCH_SERVICE_ENDPOINT=
AZURE_AI_SEARCH_INDEX_NAME=
AZURE_AI_SEARCH_API_KEY=

AZURE_AI_SEARCH_API_VERSION=
AZURE_AI_SEARCH_SEARCH_OPTION_QUERY_TYPE=
AZURE_AI_SEARCH_SEARCH_OPTION_TOP=
AZURE_AI_SEARCH_SEARCH_OPTION_SELECT=
```

#### DALL-E 3:
- OpenAI API key for DALL-E / DALL-E-3. Leave commented out to have the user provide their own key when installing the plugin. If you want to provide your own key for all users you can uncomment this line and add your OpenAI API key here.

```bash
# DALLE_API_KEY=
```

- For customization of the DALL-E-3 System prompt, uncomment the following, and provide your own prompt. **(Advanced)** 
    - See official prompt for reference: [DALL-E System Prompt](https://github.com/spdustin/ChatGPT-AutoExpert/blob/main/_system-prompts/dall-e.md)

```bash
DALLE3_SYSTEM_PROMPT="Your System Prompt here"
```

- DALL-E Proxy settings. This is separate from its OpenAI counterpart for customization purposes **(Advanced)** 

> Reverse proxy settings, changes the baseURL for the DALL-E-3 API Calls
> The URL must match the "url/v1," pattern, the "openai" suffix is also allowed.
> ```
> Examples:
>   - https://open.ai/v1
>   - https://open.ai/v1/ACCOUNT/GATEWAY/openai
>   - https://open.ai/v1/hi/openai
> ```

```bash
DALLE_REVERSE_PROXY=
```

> Note: if you have PROXY set, it will be used for DALL-E calls also, which is universal for the app

#### Google Search
See detailed instructions here: [Google Search](../features/plugins/google_search.md)

```bash
GOOGLE_API_KEY=
GOOGLE_CSE_ID=
```

#### SerpAPI
SerpApi is a real-time API to access Google search results (not as performant)

```bash
SERPAPI_API_KEY=
```

#### Stable Diffusion (Automatic1111)
See detailed instructions here: [Stable Diffusion](../features/plugins/stable_diffusion.md)

- Use "http://127.0.0.1:7860" with local install and "http://host.docker.internal:7860" for docker

```bash
SD_WEBUI_URL=http://host.docker.internal:7860
```

#### WolframAlpha
See detailed instructions here: [Wolfram Alpha](../features/plugins/wolfram.md)

```bash
WOLFRAM_APP_ID=
```

#### Zapier
- You need a Zapier account. Get your API key from here: [Zapier](https://nla.zapier.com/credentials/)
- Create allowed actions - Follow step 3 in this getting start guide from Zapier

> Note: zapier is known to be finicky with certain actions. Writing email drafts is probably the best use of it.

```bash
ZAPIER_NLA_API_KEY=
```

## Search (Meilisearch)

Enables search in messages and conversations:

```bash
SEARCH=true
```

> Note: If you're not using docker, it requires the installation of the free self-hosted Meilisearch or a paid remote plan

To disable anonymized telemetry analytics for MeiliSearch for absolute privacy, set to true:

```bash
MEILI_NO_ANALYTICS=true
```

For the API server to connect to the search server. Replace '0.0.0.0' with 'meilisearch' if serving MeiliSearch with docker-compose.

```bash
MEILI_HOST=http://0.0.0.0:7700
```

MeiliSearch HTTP Address, mainly for docker-compose to expose the search server. Replace '0.0.0.0' with 'meilisearch' if serving MeiliSearch with docker-compose.

```bash
MEILI_HTTP_ADDR=0.0.0.0:7700
```

This master key must be at least 16 bytes, composed of valid UTF-8 characters. MeiliSearch will throw an error and refuse to launch if no master key is provided or if it is under 16 bytes. MeiliSearch will suggest a secure autogenerated master key. This is a ready made secure key for docker-compose, you can replace it with your own.

```bash
MEILI_MASTER_KEY=DrhYf7zENyR6AlUCKmnz0eYASOQdl6zxH7s7MKFSfFCt
```

## User System
This section contains the configuration for:

  - [Automated Moderation](#moderation)
  - [Balance/Token Usage](#balance)
  - [Registration and Social Logins](#registration-and-login)
  - [Email Password Reset](#email-password-reset)
     
### Moderation
The Automated Moderation System uses a scoring mechanism to track user violations. As users commit actions like excessive logins, registrations, or messaging, they accumulate violation scores. Upon reaching a set threshold, the user and their IP are temporarily banned. This system ensures platform security by monitoring and penalizing rapid or suspicious activities.

see: [Automated Moderation](../features/mod_system.md)

#### Basic Moderation Settings

- `BAN_VIOLATIONS`: Whether or not to enable banning users for violations (they will still be logged)
- `BAN_DURATION`: How long the user and associated IP are banned for (in milliseconds)
- `BAN_INTERVAL` The user will be banned everytime their score reaches/crosses over the interval threshold

```bash
BAN_VIOLATIONS=true
BAN_DURATION=1000 * 60 * 60 * 2
BAN_INTERVAL=20 
```

#### Score for each violation

```bash
LOGIN_VIOLATION_SCORE=1
REGISTRATION_VIOLATION_SCORE=1
CONCURRENT_VIOLATION_SCORE=1
MESSAGE_VIOLATION_SCORE=1
NON_BROWSER_VIOLATION_SCORE=20
```

#### Login and registration rate limiting.
- `LOGIN_MAX`: The max amount of logins allowed per IP per `LOGIN_WINDOW`
- `LOGIN_WINDOW`: In minutes, determines the window of time for `LOGIN_MAX` logins
- `REGISTER_MAX`: The max amount of registrations allowed per IP per `REGISTER_WINDOW`
- `REGISTER_WINDOW`: In minutes, determines the window of time for `REGISTER_MAX` registrations

```bash
LOGIN_MAX=7
LOGIN_WINDOW=5
REGISTER_MAX=5
REGISTER_WINDOW=60
```

#### Message rate limiting (per user & IP)

- `LIMIT_CONCURRENT_MESSAGES`: Whether to limit the amount of messages a user can send per request
- `CONCURRENT_MESSAGE_MAX`: The max amount of messages a user can send per request

```bash
LIMIT_CONCURRENT_MESSAGES=true
CONCURRENT_MESSAGE_MAX=2
```

#### Limiters

> Note: You can utilize both limiters, but default is to limit by IP only.

- **IP Limiter:**
- `LIMIT_MESSAGE_IP`: Whether to limit the amount of messages an IP can send per `MESSAGE_IP_WINDOW`
- `MESSAGE_IP_MAX`: The max amount of messages an IP can send per `MESSAGE_IP_WINDOW`
- `MESSAGE_IP_WINDOW`: In minutes, determines the window of time for `MESSAGE_IP_MAX` messages

```bash
LIMIT_MESSAGE_IP=true
MESSAGE_IP_MAX=40
MESSAGE_IP_WINDOW=1
```

- **User Limiter:**
- `LIMIT_MESSAGE_USER`: Whether to limit the amount of messages an IP can send per `MESSAGE_USER_WINDOW`
- `MESSAGE_USER_MAX`: The max amount of messages an IP can send per `MESSAGE_USER_WINDOW`
- `MESSAGE_USER_WINDOW`: In minutes, determines the window of time for `MESSAGE_USER_MAX` messages


```bash
LIMIT_MESSAGE_USER=false
MESSAGE_USER_MAX=40
MESSAGE_USER_WINDOW=1
```

### Balance
The following enables user balances for the OpenAI/Plugins endpoints, which you can add manually or you will need to build out a balance accruing system for users.

see: [Token Usage](../features/token_usage.md)

- To manually add balances, run the following command:`npm run add-balance`
  - You can also specify the email and token credit amount to add, e.g.:`npm run add-balance example@example.com 1000`

> **Note:** 1000 credits = $0.001 (1 mill USD)

- Set to `true` to enable token credit balances for the OpenAI/Plugins endpoints

```bash
CHECK_BALANCE=false
```

### Registration and Login
see: [User/Auth System](../install/user_auth_system.md)

![image](https://github.com/danny-avila/LibreChat/assets/81851188/52a37d1d-7392-4a9a-a79f-90ed2da7f841)

- General Settings: 
    - `ALLOW_EMAIL_LOGIN`: Email login. Set to `true` or `false` to enable or disable ONLY email login.
    - `ALLOW_REGISTRATION`: Email registration of new users. Set to `true` or `false` to enable or disable Email registration.
    - `ALLOW_SOCIAL_LOGIN`: Allow users to connect to LibreChat with various social networks, see below. Set to `true` or `false` to enable or disable.
    - `ALLOW_SOCIAL_REGISTRATION`: Enable or disable registration of new user using various social network. Set to `true` or `false` to enable or disable.

> **Quick Tip:** Even with registration disabled, add users directly to the database using `npm run create-user`.

```bash
ALLOW_REGISTRATION=true       
ALLOW_SOCIAL_LOGIN=false
ALLOW_SOCIAL_REGISTRATION=false
```

- Default values: session expiry: 15 minutes, refresh token expiry: 7 days
  - For more information: [Refresh Token](https://github.com/danny-avila/LibreChat/pull/927)

```bash
SESSION_EXPIRY=1000 * 60 * 15
REFRESH_TOKEN_EXPIRY=(1000 * 60 * 60 * 24) * 7
```

- You should use new secure values. The examples given are 32-byte keys (64 characters in hex). 
  - Use this replit to generate some quickly: [JWT Keys](https://replit.com/@daavila/crypto#index.js)

```bash
JWT_SECRET=16f8c0ef4a5d391b26034086c628469d3f9f497f08163ab9b40137092f2909ef
JWT_REFRESH_SECRET=eaa5191f2914e30b9387fd84e254e4ba6fc51b4654968a9b0803b456a54b8418
```

### Social Logins

#### [Discord](../install/user_auth_system.md#discord-authentication)

for more information: [Discord](../install/user_auth_system.md#discord-authentication)

```bash
# Discord
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_CALLBACK_URL=/oauth/discord/callback
```

#### [Facebook](../install/user_auth_system.md#facebook-authentication)

for more information: [Facebook](../install/user_auth_system.md#facebook-authentication)

```bash
# Facebook
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
FACEBOOK_CALLBACK_URL=/oauth/facebook/callback

```
#### [GitHub](../install/user_auth_system.md#github-authentication)

for more information: [GitHub](../install/user_auth_system.md#github-authentication)

```bash
# GitHub
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_CALLBACK_URL=/oauth/github/callback
```

#### [Google](../install/user_auth_system.md#google-authentication)

for more information: [Google](../install/user_auth_system.md#google-authentication)

```bash
# Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=/oauth/google/callback
```

#### [OpenID](../install/user_auth_system.md#openid-authentication-with-azure-ad)

for more information: [Azure OpenID](../install/user_auth_system.md#openid-authentication-with-azure-ad) or [AWS Cognito OpenID](../install/user_auth_system.md#openid-authentication-with-aws-cognito)

```bash
# OpenID
OPENID_CLIENT_ID=
OPENID_CLIENT_SECRET=
OPENID_ISSUER=
OPENID_SESSION_SECRET=
OPENID_SCOPE="openid profile email"
OPENID_CALLBACK_URL=/oauth/openid/callback

OPENID_BUTTON_LABEL=
OPENID_IMAGE_URL=
```

### Email Password Reset
Email is used for password reset. See: [Email Password Reset](../install/user_auth_system.md#email-and-password-reset)

- Note that all either service or host, username and password and the From address must be set for email to work.

> If using `EMAIL_SERVICE`, **do NOT** set the extended connection parameters:
> 
> `HOST`, `PORT`, `ENCRYPTION`, `ENCRYPTION_HOSTNAME`, `ALLOW_SELFSIGNED`
> 
> Failing to set valid values here will result in LibreChat using the unsecured password reset!

See: [nodemailer well-known-services](https://community.nodemailer.com/2-0-0-beta/setup-smtp/well-known-services/)

```bash
EMAIL_SERVICE=
```

If `EMAIL_SERVICE` is not set, connect to this server:

```bash
EMAIL_HOST=
```

Mail server port to connect to with EMAIL_HOST (usually 25, 465, 587, 2525):

```bash
EMAIL_PORT=25
```

Encryption valid values: `starttls` (force STARTTLS), `tls` (obligatory TLS), anything else (use STARTTLS if available):

```bash
EMAIL_ENCRYPTION=
```

Check the name in the certificate against this instead of `EMAIL_HOST`:

```bash
EMAIL_ENCRYPTION_HOSTNAME=
```

Set to true to allow self-signed, anything else will disallow self-signed:

```bash
EMAIL_ALLOW_SELFSIGNED=
```

Username used for authentication. For consumer services, this MUST usually match EMAIL_FROM:

```bash
EMAIL_USERNAME=
```

Password used for authentication:

```bash
EMAIL_PASSWORD=
```

The human-readable address in the From is constructed as `EMAIL_FROM_NAME <EMAIL_FROM>`. Defaults to `APP_TITLE`:

```bash
EMAIL_FROM_NAME=
```

Mail address for from field. It is **REQUIRED** to set a value here (even if it's not porperly working):

```bash
EMAIL_FROM=noreply@librechat.ai 
```
