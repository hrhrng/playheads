/**
 * Vite environment variable types
 */

interface ImportMetaEnv {
  readonly VITE_SPOTIFY_CLIENT_ID: string;
  readonly VITE_SPOTIFY_REDIRECT_URI: string;
  readonly VITE_API_BASE?: string;
  [key: string]: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
