/**
 * Vitest global setup — extends matchers with DOM-specific assertions
 * (toBeInTheDocument, toHaveTextContent, etc.)
 */
import '@testing-library/jest-dom';

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
