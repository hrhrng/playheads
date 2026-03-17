/**
 * Tests for the chat store — Zustand store managing UI-only chat state.
 *
 * Messaging is handled by useAgentChatAdapter (WebSocket to AIChatAgent).
 * Queue is managed globally by usePlayQueue.
 * This store only manages: input text and sidebar visibility.
 *
 * @module store/__tests__/chatStore
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../../store/chatStore';

/** Shortcut: get the store's current state snapshot */
const state = () => useChatStore.getState();

beforeEach(() => {
  state().reset();
});

// ==================================================================
// Initial state
// ==================================================================

describe('chatStore initial state', () => {
  it('has empty input and default UI state', () => {
    const s = state();
    expect(s.input).toBe('');
    expect(s.showHistory).toBe(false);
  });
});

// ==================================================================
// UI state mutations
// ==================================================================

describe('UI state', () => {
  it('setInput() updates input text', () => {
    state().setInput('play jazz');
    expect(state().input).toBe('play jazz');
  });

  it('setShowHistory() sets sidebar visibility', () => {
    state().setShowHistory(true);
    expect(state().showHistory).toBe(true);
  });

  it('toggleHistory() toggles sidebar visibility', () => {
    expect(state().showHistory).toBe(false);
    state().toggleHistory();
    expect(state().showHistory).toBe(true);
    state().toggleHistory();
    expect(state().showHistory).toBe(false);
  });
});

// ==================================================================
// reset()
// ==================================================================

describe('reset()', () => {
  it('clears all state back to defaults', () => {
    state().setInput('draft');
    state().setShowHistory(true);

    state().reset();

    const s = state();
    expect(s.input).toBe('');
    expect(s.showHistory).toBe(false);
  });
});
