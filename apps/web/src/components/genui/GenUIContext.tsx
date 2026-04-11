/**
 * GenUI Context — provides queue operations and storefront to nested components.
 */
import { createContext, useContext } from 'react';
import type { QueueOperations } from '../../hooks/useAgentChatAdapter';

interface GenUIContextValue {
  queueOps: QueueOperations | null;
  storefront: string;
}

const GenUIContext = createContext<GenUIContextValue>({ queueOps: null, storefront: 'us' });

export function GenUIProvider({ queueOps, storefront, children }: { queueOps: QueueOperations | null; storefront: string; children: React.ReactNode }) {
  return <GenUIContext.Provider value={{ queueOps, storefront }}>{children}</GenUIContext.Provider>;
}

export function useGenUIActions(): QueueOperations | null {
  return useContext(GenUIContext).queueOps;
}

export function useStorefront(): string {
  return useContext(GenUIContext).storefront;
}

// Keep backward compat
export const GenUIActionsProvider = GenUIContext.Provider;
