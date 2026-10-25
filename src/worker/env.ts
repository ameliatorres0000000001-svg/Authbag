export interface Env {
  DB: D1Database;
  VAULT: R2Bucket;
  ASSETS: Fetcher;
  /** Optional secrets / vars — never required for the app to run */
  ENTRUPY_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  AI_MODEL?: string;
}

export type Role = 'owner' | 'lead_authenticator' | 'appraiser' | 'reviewer' | 'subscriber' | 'readonly';

export interface SessionUser { id: string; email: string; name: string; role: Role; locale: 'km' | 'en' }

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser } };
