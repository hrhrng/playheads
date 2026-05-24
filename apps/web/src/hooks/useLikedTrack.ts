import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../config/api';
import type { UnifiedTrack } from '../providers/types';

/**
 * useLikedTrack — find the user's "Liked" playlist (auto-created on first
 * like) and tell us whether the given track is in it. Provides `toggle()`
 * to add/remove and `refresh()` to re-fetch.
 *
 * We piggyback on /api/conversations: the Liked playlist is just a
 * conversation row with `is_liked: true`. To avoid fetching the whole
 * list every time, callers pass in the already-loaded `conversations`
 * array (from useConversations) and we filter locally.
 */
export function useLikedTrack(opts: {
  userId: string | null;
  currentTrack: UnifiedTrack | null;
  conversations: Array<{ id: string; is_liked?: boolean; playlist?: unknown }>;
  onMutated?: () => void;
}) {
  const { userId, currentTrack, conversations, onMutated } = opts;

  const likedConversation = conversations.find((c) => c.is_liked);
  const likedTracks: UnifiedTrack[] = Array.isArray(likedConversation?.playlist)
    ? (likedConversation?.playlist as UnifiedTrack[])
    : [];

  // Optimistic flip so the heart fills/empties instantly while the
  // server roundtrip is in flight.
  const [optimistic, setOptimistic] = useState<{ trackId: string; liked: boolean } | null>(null);

  // Reset optimistic state whenever the upstream list changes — at that
  // point the server is the source of truth.
  useEffect(() => {
    setOptimistic(null);
  }, [conversations]);

  const isLiked = currentTrack
    ? optimistic?.trackId === currentTrack.id
      ? optimistic.liked
      : likedTracks.some((t) => t.id === currentTrack.id)
    : false;

  const toggle = useCallback(async () => {
    if (!userId || !currentTrack) return;
    setOptimistic({ trackId: currentTrack.id, liked: !isLiked });
    try {
      const res = await fetch(`${API_BASE}/playlists/liked/toggle-track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, track: currentTrack }),
      });
      if (!res.ok) throw new Error(`toggle-track ${res.status}`);
      onMutated?.();
    } catch (e) {
      console.warn('[useLikedTrack] toggle failed', e);
      // Roll back optimistic flip on error.
      setOptimistic(null);
    }
  }, [userId, currentTrack, isLiked, onMutated]);

  return { isLiked, toggle };
}
