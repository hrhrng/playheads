/**
 * useVoiceDJ — app-level wrapper over @cloudflare/voice's useVoiceAgent.
 *
 * Responsibilities beyond the raw hook:
 *  1. Connect to the VoiceDJAgent DO with the user context (userId, storefront).
 *  2. Dispatch music-action events pushed by the agent over the same WS
 *     to the existing queue operations — same side-effect as the chat agent.
 *  3. Duck Apple Music volume while the DJ is speaking, restore when idle.
 */
import { useEffect, useRef, useCallback } from 'react';
import { useVoiceAgent } from '@cloudflare/voice/react';
import type { AppleMusicProvider } from '../providers/AppleMusicProvider';
import type { QueueOperations } from './useAgentChatAdapter';

interface MusicActionPayload {
  type: 'add_to_queue' | 'play_track' | 'skip_next' | 'remove_track';
  data: Record<string, unknown>;
}

interface CustomMessage {
  type?: string;
  id?: string;
  action?: MusicActionPayload;
}

interface UseVoiceDJParams {
  /** Whether voice mode is currently active — controls connection lifecycle. */
  enabled: boolean;
  userId: string | null;
  storefront: string;
  /** Per-user DO instance name — keeps voice state isolated across users. */
  instanceName?: string;
  /** Apple Music provider for volume ducking. */
  provider: AppleMusicProvider | null;
  /** Queue dispatcher (reused from chat flow). */
  queueOps?: QueueOperations;
  /** Volume to duck to while DJ speaks (0–1). Default 0.25. */
  duckedVolume?: number;
  /** Volume to restore when DJ stops speaking. Default 1. */
  restoredVolume?: number;
}

export function useVoiceDJ({
  enabled,
  userId,
  storefront,
  instanceName,
  provider,
  queueOps,
  duckedVolume = 0.25,
  restoredVolume = 1,
}: UseVoiceDJParams) {
  const voice = useVoiceAgent({
    agent: 'VoiceDJAgent',
    name: instanceName || userId || 'default',
    query: {
      userId: userId ?? undefined,
      storefront,
    },
  });

  // ── Music-action dispatch ───────────────────────────────────────
  // Voice agent pushes `{ type: "music-action", id, action }` via sendJSON;
  // that arrives here as `lastCustomMessage`. Dedupe by id (same pattern as
  // useAgentChatAdapter's onData handler).
  const queueOpsRef = useRef(queueOps);
  queueOpsRef.current = queueOps;
  const processedActionIds = useRef(new Set<string>());

  useEffect(() => {
    const msg = voice.lastCustomMessage as CustomMessage | null | undefined;
    if (!msg || msg.type !== 'music-action' || !msg.action) return;
    if (msg.id && processedActionIds.current.has(msg.id)) return;
    if (msg.id) processedActionIds.current.add(msg.id);

    const ops = queueOpsRef.current;
    if (!ops) return;

    const { action } = msg;
    console.log('[useVoiceDJ] Dispatching:', action.type, action.data);

    if (action.type === 'add_to_queue' && action.data?.track_id) {
      ops.addTrack({
        id: action.data.track_id as string,
        name: (action.data.name as string) || 'Unknown',
        artist: (action.data.artist as string) || 'Unknown Artist',
        album: (action.data.album as string) || '',
        artworkUrl: (action.data.artwork_url as string) || '',
        durationSeconds: (action.data.duration as number) || 0,
        provider: 'apple-music',
      });
    } else if (action.type === 'remove_track' && action.data?.index != null) {
      ops.removeTrack(action.data.index as number);
    } else if (action.type === 'play_track') {
      ops.playAtIndex(action.data.index as number).catch((e) =>
        console.error('[useVoiceDJ] play_track error:', e)
      );
    } else if (action.type === 'skip_next') {
      ops.skipNext().catch((e) =>
        console.error('[useVoiceDJ] skip_next error:', e)
      );
    }
  }, [voice.lastCustomMessage]);

  // ── Ducking ─────────────────────────────────────────────────────
  // When status === "speaking", attenuate Apple Music so the DJ voice
  // sits on top; restore when the turn ends. We snapshot the pre-duck
  // volume so a user who had lowered the volume gets it back.
  const preDuckVolumeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!provider) return;
    if (voice.status === 'speaking') {
      if (preDuckVolumeRef.current == null) {
        preDuckVolumeRef.current = provider.getVolume();
      }
      provider.setVolume(duckedVolume);
    } else if (preDuckVolumeRef.current != null) {
      provider.setVolume(preDuckVolumeRef.current ?? restoredVolume);
      preDuckVolumeRef.current = null;
    }
  }, [voice.status, provider, duckedVolume, restoredVolume]);

  // ── Auto-connect lifecycle ──────────────────────────────────────
  // enabled=false → hang up (useful when the user closes the modal).
  const startedRef = useRef(false);
  const startCall = useCallback(async () => {
    try {
      await voice.startCall();
      startedRef.current = true;
    } catch (e) {
      console.error('[useVoiceDJ] startCall failed:', e);
    }
  }, [voice]);

  const endCall = useCallback(() => {
    try { voice.endCall(); } catch { /* ignore */ }
    startedRef.current = false;
    // Restore volume if we were mid-duck
    if (provider && preDuckVolumeRef.current != null) {
      provider.setVolume(preDuckVolumeRef.current);
      preDuckVolumeRef.current = null;
    }
  }, [voice, provider]);

  useEffect(() => {
    if (enabled && !startedRef.current) {
      startCall();
    } else if (!enabled && startedRef.current) {
      endCall();
    }
    return () => {
      // Ensure cleanup on unmount
      if (startedRef.current) endCall();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    status: voice.status,
    transcript: voice.transcript,
    interimTranscript: voice.interimTranscript,
    audioLevel: voice.audioLevel,
    isMuted: voice.isMuted,
    connected: voice.connected,
    error: voice.error,
    toggleMute: voice.toggleMute,
    sendText: voice.sendText,
    startCall,
    endCall,
  };
}

export type UseVoiceDJReturn = ReturnType<typeof useVoiceDJ>;
