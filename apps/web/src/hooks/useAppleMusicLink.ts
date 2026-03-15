/**
 * Hook for Apple Music account linking state and logic
 * On page load, checks two cases:
 * 1. User never connected → toast to connect
 * 2. User connected but token expired → toast to refresh
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { validateAppleMusicToken } from '../api/appleMusicAuth';

interface UseAppleMusicLinkReturn {
  isAppleLinked: boolean;
  /** null = no token, undefined = still checking */
  storedMusicUserToken: string | null | undefined;
  isTokenChecked: boolean;
  linkApple: () => Promise<void>;
}

export default function useAppleMusicLink(userId: string | null): UseAppleMusicLinkReturn {
  const [isAppleLinked, setIsAppleLinked] = useState(false);
  const [storedMusicUserToken, setStoredMusicUserToken] = useState<string | null | undefined>(undefined);
  const [isTokenChecked, setIsTokenChecked] = useState(false);
  const checkedRef = useRef(false);

  // Link Apple Music: authorize via MusicKit, save token via /api/profile
  const linkApple = useCallback(async () => {
    const mk = (window as any).MusicKit?.getInstance();
    if (!mk) {
      toast.error('Apple Music is not ready', {
        description: 'MusicKit failed to initialize. Please refresh the page.',
      });
      return;
    }

    try {
      await mk.authorize();
    } catch (e) {
      console.error('MusicKit authorize error:', e);
      return;
    }

    if (mk.isAuthorized && userId) {
      const token = mk.musicUserToken;
      if (token) {
        try {
          const res = await fetch('/api/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, appleMusicToken: token }),
          });

          if (res.ok) {
            setIsAppleLinked(true);
            setStoredMusicUserToken(token);
            toast.success('Apple Music connected successfully');
          } else {
            console.error('Link Error:', await res.text());
            toast.error('Failed to connect Apple Music', {
              description: 'Please try again or check your connection',
            });
          }
        } catch (err) {
          console.error('Link Error:', err);
          toast.error('Failed to connect Apple Music', {
            description: 'Please try again or check your connection',
          });
        }
      }
    }
  }, [userId]);

  // On page load: check link status and validate token
  useEffect(() => {
    if (!userId) {
      setIsTokenChecked(true);
      return;
    }
    if (checkedRef.current) return;
    checkedRef.current = true;

    (async () => {
      try {
        // 1. Check if user has a token stored
        const res = await fetch(`/api/profile?userId=${userId}`);
        if (!res.ok) {
          setIsAppleLinked(false);
          setStoredMusicUserToken(null);
          setIsTokenChecked(true);
          toast.info('Connect Apple Music', {
            description: 'Link your account to enable music playback.',
            duration: 8000,
            action: { label: 'Connect', onClick: () => linkApple() },
          });
          return;
        }

        const data = await res.json();
        const token = data?.appleMusicToken || null;

        if (!token) {
          setIsAppleLinked(false);
          setStoredMusicUserToken(null);
          setIsTokenChecked(true);
          toast.info('Connect Apple Music', {
            description: 'Link your account to enable music playback.',
            duration: 8000,
            action: { label: 'Connect', onClick: () => linkApple() },
          });
          return;
        }

        // 2. Has token — validate it
        const { valid, reason } = await validateAppleMusicToken(userId);

        if (valid) {
          setIsAppleLinked(true);
          setStoredMusicUserToken(token);
        } else {
          setIsAppleLinked(false);
          setStoredMusicUserToken(null);
          toast.error(
            reason === 'token_expired'
              ? 'Apple Music session expired'
              : 'Apple Music connection issue',
            {
              description: 'Please reconnect your account.',
              duration: 8000,
              action: { label: 'Reconnect', onClick: () => linkApple() },
            },
          );
        }
      } catch {
        setIsAppleLinked(false);
        setStoredMusicUserToken(null);
      }
      setIsTokenChecked(true);
    })();
  }, [userId, linkApple]);

  return {
    isAppleLinked,
    storedMusicUserToken,
    isTokenChecked,
    linkApple,
  };
}
