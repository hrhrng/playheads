/**
 * GenUI Context — provides queue operations and storefront to nested components.
 */
import { createContext, useContext } from 'react';
import type { QueueOperations } from '../../hooks/useAgentChatAdapter';

interface GenUIContextValue {
  queueOps: QueueOperations | null;
  storefront: string;
  /** Play a track by Apple Music ID (adds to queue + starts playback) */
  playTrackById?: (trackId: string) => Promise<void>;
}

const GenUIContext = createContext<GenUIContextValue>({ queueOps: null, storefront: 'us' });

export function GenUIProvider({ queueOps, storefront, playTrackById, children }: {
  queueOps: QueueOperations | null;
  storefront: string;
  playTrackById?: (trackId: string) => Promise<void>;
  children: React.ReactNode;
}) {
  return <GenUIContext.Provider value={{ queueOps, storefront, playTrackById }}>{children}</GenUIContext.Provider>;
}

export function usePlayTrackById(): ((trackId: string) => Promise<void>) | undefined {
  return useContext(GenUIContext).playTrackById;
}

export function useGenUIActions(): QueueOperations | null {
  return useContext(GenUIContext).queueOps;
}

export function useStorefront(): string {
  return useContext(GenUIContext).storefront;
}

// Keep backward compat
export const GenUIActionsProvider = GenUIContext.Provider;
