/**
 * GenUI Actions Context — provides queue operations to deeply nested GenUI components
 * without prop drilling through every layout level.
 */
import { createContext, useContext } from 'react';
import type { QueueOperations } from '../../hooks/useAgentChatAdapter';

const GenUIActionsContext = createContext<QueueOperations | null>(null);

export const GenUIActionsProvider = GenUIActionsContext.Provider;

export function useGenUIActions(): QueueOperations | null {
  return useContext(GenUIActionsContext);
}
