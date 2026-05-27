/**
 * Vitest global setup — extends matchers with DOM-specific assertions
 * (toBeInTheDocument, toHaveTextContent, etc.) and boots i18next so
 * components using `t()` render English strings instead of bare keys.
 */
import '@testing-library/jest-dom';
import '../i18n';

// Mock IntersectionObserver for components that use it (e.g. infinite scroll)
globalThis.IntersectionObserver = class IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  constructor(private callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
} as unknown as typeof globalThis.IntersectionObserver;
