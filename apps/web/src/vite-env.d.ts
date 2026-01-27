/**
 * Vite environment variable types
 */

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_APPLE_DEVELOPER_TOKEN: string;
  readonly VITE_SPOTIFY_CLIENT_ID: string;
  readonly VITE_SPOTIFY_REDIRECT_URI: string;
  // Add other env variables here
  [key: string]: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
