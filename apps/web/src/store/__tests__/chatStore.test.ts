/**
 * Tests for the chat store — Zustand store managing UI-only chat state.
 *
 * Messaging is now handled by useAgentChatAdapter (WebSocket to AIChatAgent).
 * This store only manages: input text, sidebar visibility, and playlist view.
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
    expect(s.viewedPlaylist).toEqual([]);
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
// Playlist management
// ==================================================================

describe('viewedPlaylist', () => {
  const track = {
    id: '123',
    name: 'Test Track',
    artist: 'Test Artist',
    album: 'Test Album',
    artwork_url: 'https://example.com/art.jpg',
    duration: 240,
  };

  it('setViewedPlaylist() replaces the playlist', () => {
    state().setViewedPlaylist([track]);
    expect(state().viewedPlaylist).toEqual([track]);
  });

  it('addToViewedPlaylist() appends a track', () => {
    state().setViewedPlaylist([track]);
    const track2 = { ...track, id: '456', name: 'Track 2' };
    state().addToViewedPlaylist(track2);
    expect(state().viewedPlaylist).toHaveLength(2);
    expect(state().viewedPlaylist[1].id).toBe('456');
  });

  it('removeFromViewedPlaylist() removes by index', () => {
    const track2 = { ...track, id: '456', name: 'Track 2' };
    state().setViewedPlaylist([track, track2]);
    state().removeFromViewedPlaylist(0);
    expect(state().viewedPlaylist).toHaveLength(1);
    expect(state().viewedPlaylist[0].id).toBe('456');
  });
});

// ==================================================================
// reset()
// ==================================================================

describe('reset()', () => {
  it('clears all state back to defaults', () => {
    state().setInput('draft');
    state().setShowHistory(true);
    state().setViewedPlaylist([{ id: '1', name: 'T', artist: 'A', album: '', artwork_url: '', duration: 0 }]);

    state().reset();

    const s = state();
    expect(s.input).toBe('');
    expect(s.showHistory).toBe(false);
    expect(s.viewedPlaylist).toEqual([]);
  });
});
