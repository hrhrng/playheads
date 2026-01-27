/**
 * Spotify authentication utilities
 * @module utils/spotifyAuth
 */

/**
 * Generate a random string for PKCE code verifier
 *
 * @param length - Length of the random string to generate
 * @returns Random string for use as code verifier
 */
export function generateRandomString(length: number): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * Generate code challenge for PKCE flow
 *
 * @param codeVerifier - The code verifier to hash
 * @returns Base64 URL-encoded SHA-256 hash
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Initiate Spotify login flow using PKCE
 * Redirects user to Spotify authorization page
 *
 * @throws {Error} If CLIENT_ID is not configured
 */
export async function loginWithSpotify(): Promise<void> {
  const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI || 'http://localhost:5173/callback';

  if (!CLIENT_ID) {
    throw new Error('VITE_SPOTIFY_CLIENT_ID is not configured');
  }

  const codeVerifier = generateRandomString(128);
  const challenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(16);

  localStorage.setItem('code_verifier', codeVerifier);

  const scope = 'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private streaming user-read-email user-read-private';

  const args = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: scope,
    redirect_uri: REDIRECT_URI,
    state: state,
    code_challenge_method: 'S256',
    code_challenge: challenge
  });

  window.location.href = 'https://accounts.spotify.com/authorize?' + args.toString();
}

/**
 * Exchange authorization code for access token
 *
 * @param code - Authorization code from Spotify callback
 * @returns Token response from Spotify API
 * @throws {Error} If code verifier is missing or token request fails
 */
export async function getToken(code: string): Promise<SpotifyTokenResponse> {
  const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI || 'http://localhost:5173/callback';

  if (!CLIENT_ID) {
    throw new Error('VITE_SPOTIFY_CLIENT_ID is not configured');
  }

  const codeVerifier = localStorage.getItem('code_verifier');

  if (!codeVerifier) {
    throw new Error('Code verifier not found in localStorage');
  }

  const payload = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  };

  const response = await fetch('https://accounts.spotify.com/api/token', payload);

  if (!response.ok) {
    throw new Error(`Token request failed: ${response.status} ${response.statusText}`);
  }

  return await response.json() as SpotifyTokenResponse;
}

/**
 * Spotify token response
 */
export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token: string;
}
