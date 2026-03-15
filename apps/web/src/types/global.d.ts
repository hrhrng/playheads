/**
 * Global type definitions
 */

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
