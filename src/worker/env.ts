export interface Env {
  DB: D1Database;
  VAULT: R2Bucket;
  ASSETS: Fetcher;
  /** Optional secrets / vars — never required for the app to run */
  ENTRUPY_API_KEY?: string;
  /** Optional override of Entrupy's API base (e.g. a sandbox host Entrupy gives you). Defaults to https://api.entrupy.com */
  ENTRUPY_API_BASE?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  AI_MODEL?: string;
  /** Gemini model used for text translation when GEMINI_API_KEY is set (default gemini-3.8-flash) */
  GEMINI_MODEL?: string;
}

export type Role = 'owner' | 'lead_authenticator' | 'appraiser' | 'reviewer' | 'subscriber' | 'readonly';

export interface SessionUser { id: string; email: string; name: string; role: Role; locale: 'km' | 'en' }

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser } };
