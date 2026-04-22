/**
 * VoiceModeContext — app-wide state for the voice DJ overlay.
 *
 * Voice mode is triggered from the chat composer (ChatInput waveform button)
 * but the modal itself renders at app level so it covers the entire viewport.
 * This context is the cheapest way to let deep components (the composer)
 * flip a switch that a sibling of <Routes> reads.
 */
import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

interface VoiceModeContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const VoiceModeContext = createContext<VoiceModeContextValue | null>(null);

export function VoiceModeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  return (
    <VoiceModeContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </VoiceModeContext.Provider>
  );
}

export function useVoiceMode(): VoiceModeContextValue {
  const ctx = useContext(VoiceModeContext);
  if (!ctx) {
    // Safe fallback when the provider is absent (e.g. tests). Voice mode
    // stays closed and open() is a no-op.
    return { isOpen: false, open: () => {}, close: () => {}, toggle: () => {} };
  }
  return ctx;
}
