/**
 * Global type definitions
 */

/**
 * Supabase session type
 */
export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: SupabaseUser;
}

/**
 * Supabase user
 */
export interface SupabaseUser {
  id: string;
  email?: string;
  email_confirmed_at?: string;
  phone?: string;
  phone_confirmed_at?: string;
  last_sign_in_at?: string;
  created_at?: string;
  updated_at?: string;
  app_metadata?: AppMetadata;
  user_metadata?: UserMetadata;
  identities?: Identity[];
  is_anonymous?: boolean;
}

/**
 * App metadata
 */
export interface AppMetadata {
  provider?: string;
  providers?: string[];
  [key: string]: unknown;
}

/**
 * User metadata
 */
export interface UserMetadata {
  [key: string]: unknown;
}

/**
 * Identity
 */
interface Identity {
  identity_id?: string;
  id: string;
  user_id: string;
  identity_data?: Record<string, unknown>;
  provider: string;
  last_sign_in_at?: string;
  created_at?: string;
  updated_at?: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Supabase Session type (simplified - using any for complex nested types)
 */
interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: SupabaseUser;
}

/**
 * Supabase auth state
 */
export interface SupabaseAuthState {
  session: SupabaseSession | null;
  loading: boolean;
  error?: Error | null;
}

/**
 * Router location state
 */
export interface RouterLocationState {
  initialMessage?: string;
  isNewlyCreated?: boolean;
  preservedMessages?: unknown[];
  [key: string]: unknown;
}

/**
 * Conversation metadata
 */
export interface Conversation {
  id: string;
  title?: string;
  message_count: number;
  last_message_preview?: string;
  last_message_at?: string;
  is_pinned: boolean;
  updated_at?: string;
  created_at?: string;
  is_archived?: boolean;
  [key: string]: unknown;
}

/**
 * Window interface extensions
 */
declare global {
  interface Window {
    // Supabase
    supabase?: {
      auth: {
        getSession(): Promise<{ data: { session: SupabaseSession | null } }>;
        onAuthStateChange(
          callback: (event: string, session: SupabaseSession | null) => void
        ): { data: { subscription: { unsubscribe: () => void } } };
      };
    };

    // Apple MusicKit
    MusicKit?: {
      configure(config: { developerToken: string; app: { name: string; build: string } }): Promise<unknown>;
      PlaybackStates: {
        playing: string;
        paused: string;
        stopped: string;
      };
    };

    // Environment variables (injected by Vite)
    import?: {
      meta: {
        env: Record<string, string>;
      };
    };
  }
}

export {};
