/**
 * Tests for the chat store — Zustand store managing UI-only chat state.
 *
 * Messaging is handled by useAgentChatAdapter (WebSocket to AIChatAgent).
 * Queue is managed globally by usePlayQueue.
 * View mode is managed by useViewState.
 * This store only manages: input text.
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
  it('has empty input', () => {
    const s = state();
    expect(s.input).toBe('');
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
});

// ==================================================================
// reset()
// ==================================================================

describe('reset()', () => {
  it('clears all state back to defaults', () => {
    state().setInput('draft');

    state().reset();

    const s = state();
    expect(s.input).toBe('');
  });
});
