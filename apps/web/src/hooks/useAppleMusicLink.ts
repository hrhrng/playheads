/**
 * Hook for Apple Music account linking state and logic
 * Owns: link status check, token validation, overlay visibility, and linking flow
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { validateAppleMusicToken } from '../api/appleMusicAuth';

interface UseAppleMusicLinkReturn {
  isAppleLinked: boolean;
  checkingLink: boolean;
  storedMusicUserToken: string | null;
  showOverlay: boolean;
  linkApple: () => Promise<void>;
  dismissOverlay: () => void;
  requestOverlay: () => void;
}

export default function useAppleMusicLink(userId: string | null): UseAppleMusicLinkReturn {
  const [isAppleLinked, setIsAppleLinked] = useState(false);
  const [checkingLink, setCheckingLink] = useState(false);
  const [storedMusicUserToken, setStoredMusicUserToken] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const tokenValidated = useRef(false);

  // Check Apple Music link status from Supabase
  useEffect(() => {
    if (!userId) {
      setIsAppleLinked(false);
      setCheckingLink(false);
      return;
    }

    setCheckingLink(true);
    supabase
      .from('profiles')
      .select('apple_music_token')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        const token = data?.apple_music_token || null;
        setIsAppleLinked(!!token);
        setStoredMusicUserToken(token);
        setCheckingLink(false);
      });
  }, [userId]);

  // Auto-show overlay if not linked and not dismissed
  useEffect(() => {
    const dismissed = sessionStorage.getItem('apple_link_dismissed');
    if (userId && !isAppleLinked && !checkingLink && !dismissed) {
      setShowOverlay(true);
    } else if (isAppleLinked) {
      setShowOverlay(false);
    }
  }, [userId, isAppleLinked, checkingLink]);

  // Validate token once on mount
  useEffect(() => {
    if (!userId || !isAppleLinked || tokenValidated.current) return;
    tokenValidated.current = true;

    validateAppleMusicToken(userId)
      .then(({ valid, reason }) => {
        if (!valid) {
          setIsAppleLinked(false);
          if (reason === 'token_expired') {
            toast.error('Apple Music session expired', {
              description: 'Please reconnect your account',
              duration: 6000,
              action: {
                label: 'Reconnect',
                onClick: () => requestOverlay(),
              },
            });
          }
        }
      })
      .catch((err) => {
        console.error('Token validation failed:', err);
      });
  }, [userId, isAppleLinked]);

  // Link Apple Music: authorize directly via MusicKit, save token to Supabase
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
        const { error } = await supabase
          .from('profiles')
          .update({ apple_music_token: token })
          .eq('id', userId);

        if (!error) {
          setIsAppleLinked(true);
          setStoredMusicUserToken(token);
          toast.success('Apple Music connected successfully');
        } else {
          console.error('Link Error:', error);
          toast.error('Failed to connect Apple Music', {
            description: 'Please try again or check your connection',
            action: {
              label: 'Retry',
              onClick: () => linkApple(),
            },
          });
        }
      }
    }
  }, [userId]);

  const dismissOverlay = useCallback(() => {
    setShowOverlay(false);
    sessionStorage.setItem('apple_link_dismissed', 'true');
  }, []);

  const requestOverlay = useCallback(() => {
    setShowOverlay(true);
    sessionStorage.removeItem('apple_link_dismissed');
  }, []);

  return {
    isAppleLinked,
    checkingLink,
    storedMusicUserToken,
    showOverlay,
    linkApple,
    dismissOverlay,
    requestOverlay,
  };
}
