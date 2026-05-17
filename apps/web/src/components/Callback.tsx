/**
 * Callback - Spotify authentication callback handler
 * @module components/Callback
 */

import { useEffect, useRef } from 'react';
import { getToken } from '../utils/spotifyAuth';
import type { SpotifyTokenResponse } from '../utils/spotifyAuth';

/**
 * Spotify authentication callback component
 * Handles OAuth callback and token exchange
 */
export const Callback = (): React.JSX.Element => {
  const called = useRef<boolean>(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      getToken(code).then((response: SpotifyTokenResponse) => {
        if (response.access_token) {
          localStorage.setItem('spotify_access_token', response.access_token);
          window.location.href = '/';
        }
      });
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="glass-strong rounded-sheet p-8 flex flex-col items-center gap-4 shadow-glass">
        <div className="w-12 h-12 border-4 border-t-accent border-r-accent border-b-rule border-l-rule rounded-full animate-spin"></div>
        <div className="text-xl font-display font-semibold uppercase text-ink tracking-widest">Authenticating</div>
      </div>
    </div>
  );
};
