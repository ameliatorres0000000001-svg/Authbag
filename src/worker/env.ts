export interface Env {
  DB: D1Database;
  VAULT: R2Bucket;
  ASSETS: Fetcher;
  /** Workers AI (background removal for market model photos); optional so the app runs without it */
  AI?: Ai;
  /** Optional secrets / vars — never required for the app to run */
  ENTRUPY_API_KEY?: string;
  /** Optional override of Entrupy's API base (e.g. a sandbox host Entrupy gives you). Defaults to https://api.entrupy.com */
  ENTRUPY_API_BASE?: string;
  ANTHROPIC_API_KEY?: string;
  /** Claude through Amazon Bedrock (Claude in Amazon Bedrock / bedrock-mantle): a Bedrock API key, or AWS access keys
   *  for SigV4 (IAM permission bedrock-mantle:CreateInference); AWS_REGION is a var (default us-east-1). Secrets. */
  BEDROCK_API_KEY?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_SESSION_TOKEN?: string;
  AWS_REGION?: string;
  /** Any OpenAI-compatible chat API (OpenAI, a gateway, OpenRouter…): key (secret), base URL (default https://api.openai.com/v1) and model. */
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  /** Optional override of the main AI provider: "anthropic", "bedrock", "openai" or "gemini" (otherwise chosen from the keys set). */
  AI_PROVIDER?: string;
  GEMINI_API_KEY?: string;
  AI_MODEL?: string;
  /** Gemini model used for text translation when GEMINI_API_KEY is set (default gemini-3.8-flash) */
  GEMINI_MODEL?: string;
  /** Telegram bot for expert review: bot token, the experts' group chat id, and the webhook secret token */
  /** optional API gateway in front of Claude (https URL); empty = Anthropic directly */
  ANTHROPIC_BASE_URL?: string;
  /** LINE Login channel (LINE Developers): channel ID and channel secret */
  LINE_CHANNEL_ID?: string;
  LINE_CHANNEL_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  /** Azure AI Speech (Khmer text-to-speech): key is a secret, region a var (e.g. southeastasia); optional Khmer voice name */
  AZURE_SPEECH_KEY?: string;
  AZURE_SPEECH_REGION?: string;
  AZURE_SPEECH_VOICE_KM?: string;
}

export type Role = 'owner' | 'lead_authenticator' | 'appraiser' | 'reviewer' | 'subscriber' | 'readonly';

export interface SessionUser { id: string; email: string; name: string; role: Role; locale: 'km' | 'en' }

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser } };
