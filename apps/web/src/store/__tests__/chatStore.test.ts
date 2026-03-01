/**
 * Tests for the chat store — Zustand store managing chat state,
 * messages, streaming SSE parsing, and backend communication.
 *
 * @module store/__tests__/chatStore
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useChatStore } from '../../store/chatStore';

// ------------------------------------------------------------------
// Mocks
// ------------------------------------------------------------------

/** Mock API_BASE so the store's fetch URLs resolve to a test host */
vi.mock('../../config/api', () => ({ API_BASE: 'http://test:8001' }));

/** Mock sonner toast so side-effect toasts don't throw */
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/**
 * Build a mock SSE Response from an array of string chunks.
 * Each chunk is enqueued as a separate Uint8Array to simulate
 * TCP fragmentation — callers can split SSE lines across chunks
 * to exercise the lineBuffer logic.
 */
function createSSEResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

/** Shortcut: get the store's current state snapshot */
const state = () => useChatStore.getState();

// ------------------------------------------------------------------
// Reset store + global mocks between tests
// ------------------------------------------------------------------

beforeEach(() => {
  state().reset();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ==================================================================
// Initial state
// ==================================================================

describe('chatStore initial state', () => {
  it('has empty messages, empty input, and null ids', () => {
    const s = state();
    expect(s.messages).toEqual([]);
    expect(s.input).toBe('');
    expect(s.isLoading).toBe(false);
    expect(s.sessionId).toBeNull();
    expect(s.userId).toBeNull();
  });
});

// ==================================================================
// initialize()
// ==================================================================

describe('initialize()', () => {
  it('sets sessionId and userId, clears messages for a new session', () => {
    // Pre-populate some messages
    state().addMessage({ role: 'user', content: 'hi' } as any);
    expect(state().messages).toHaveLength(1);

    state().initialize('session-1', 'user-1');

    expect(state().sessionId).toBe('session-1');
    expect(state().userId).toBe('user-1');
    // Messages cleared because previous sessionId was null (different session)
    expect(state().messages).toEqual([]);
  });

  it('preserves messages when re-initializing with the same session', () => {
    state().initialize('session-1', 'user-1');
    state().addMessage({ role: 'user', content: 'hello' } as any);
    expect(state().messages).toHaveLength(1);

    // Same session — messages should survive
    state().initialize('session-1', 'user-1');
    expect(state().messages).toHaveLength(1);
  });

  it('clears messages when switching to a different session', () => {
    state().initialize('session-1', 'user-1');
    state().addMessage({ role: 'user', content: 'hello' } as any);

    state().initialize('session-2', 'user-1');
    expect(state().messages).toEqual([]);
    expect(state().sessionId).toBe('session-2');
  });
});

// ==================================================================
// addMessage / addUserMessage / updateLastMessage
// ==================================================================

describe('message mutations', () => {
  it('addMessage() appends a message', () => {
    state().addMessage({ role: 'agent', content: 'hi' } as any);
    expect(state().messages).toHaveLength(1);
    expect(state().messages[0]).toMatchObject({ role: 'agent', content: 'hi' });
  });

  it('addUserMessage() adds a message with role=user', () => {
    state().addUserMessage('play some jazz');
    const msgs = state().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ role: 'user', content: 'play some jazz' });
  });

  it('updateLastMessage() updates the last message content', () => {
    state().addMessage({ role: 'agent', content: 'partial...' } as any);
    state().updateLastMessage('full response');
    expect(state().messages[0]).toMatchObject({ content: 'full response' });
  });

  it('updateLastMessage() is a no-op when messages are empty', () => {
    // Should not throw
    state().updateLastMessage('no-op');
    expect(state().messages).toEqual([]);
  });
});

// ==================================================================
// reset()
// ==================================================================

describe('reset()', () => {
  it('clears all mutable state back to defaults', () => {
    state().initialize('s1', 'u1');
    state().addMessage({ role: 'user', content: 'hi' } as any);
    state().setInput('draft');

    state().reset();

    const s = state();
    expect(s.messages).toEqual([]);
    expect(s.input).toBe('');
    expect(s.isLoading).toBe(false);
    expect(s.sessionId).toBeNull();
    expect(s.showHistory).toBe(false);
  });
});

// ==================================================================
// loadHistory()
// ==================================================================

describe('loadHistory()', () => {
  it('loads and maps chat history with legacy (content) format', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        chat_history: [
          { role: 'user', content: 'play jazz' },
          { role: 'agent', content: 'Sure, playing jazz for you!' },
        ],
      }),
    } as Response);

    const result = await state().loadHistory('s1', 'u1');

    expect(result).toBe('success');
    expect(state().messages).toHaveLength(2);
    expect(state().messages[0]).toMatchObject({ role: 'user', content: 'play jazz' });
    expect(state().messages[1]).toMatchObject({ role: 'agent', content: 'Sure, playing jazz for you!' });
  });

  it('loads and maps chat history with modern (parts) format', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        chat_history: [
          {
            role: 'agent',
            parts: [
              { type: 'thinking', content: 'searching...' },
              { type: 'text', content: 'Here is what I found' },
            ],
          },
        ],
      }),
    } as Response);

    const result = await state().loadHistory('s1', 'u1');

    expect(result).toBe('success');
    const msg = state().messages[0] as any;
    expect(msg.parts).toHaveLength(2);
    expect(msg.parts[0].type).toBe('thinking');
    expect(msg.parts[1].type).toBe('text');
  });

  it('returns "not_found" on 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);

    const result = await state().loadHistory('missing', 'u1');
    expect(result).toBe('not_found');
    expect(state().messages).toEqual([]);
  });

  it('returns "error" on server error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);

    const result = await state().loadHistory('s1', 'u1');
    expect(result).toBe('error');
  });

  it('returns "error" on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    const result = await state().loadHistory('s1', 'u1');
    expect(result).toBe('error');
    expect(state().isLoadingHistory).toBe(false);
  });

  it('returns "success" immediately for empty sessionId', async () => {
    const result = await state().loadHistory('', 'u1');
    expect(result).toBe('success');
    expect(state().messages).toEqual([]);
  });
});

// ==================================================================
// sendMessage() — error path
// ==================================================================

describe('sendMessage() error handling', () => {
  it('adds an error message and shows toast on fetch failure', async () => {
    const { toast } = await import('sonner');

    state().initialize('s1', 'u1');
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('connection refused'));

    await state().sendMessage('hello');

    // Should have appended an error agent message
    const msgs = state().messages;
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    const lastMsg = msgs[msgs.length - 1] as any;
    expect(lastMsg.role).toBe('agent');
    expect(lastMsg.content).toContain('trouble connecting');

    // Toast should have been called
    expect(toast.error).toHaveBeenCalled();
  });

  it('skips sending when input is empty', async () => {
    globalThis.fetch = vi.fn();
    state().initialize('s1', 'u1');

    await state().sendMessage('   ');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('skips sending when userId is missing', async () => {
    const { toast } = await import('sonner');
    globalThis.fetch = vi.fn();

    // Explicitly ensure userId is null (reset() doesn't clear userId)
    useChatStore.setState({ userId: null });

    await state().sendMessage('hello');

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('skips sending when already loading', async () => {
    globalThis.fetch = vi.fn();
    state().initialize('s1', 'u1');
    useChatStore.setState({ isLoading: true });

    await state().sendMessage('hello');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

// ==================================================================
// handleStreamingResponse() — SSE parsing
// ==================================================================

describe('handleStreamingResponse() SSE parsing', () => {
  /**
   * Simulate receiving multiple text SSE events in one chunk.
   * Verifies that consecutive text events accumulate into a single text part.
   */
  it('accumulates text events into a single text part', async () => {
    const response = createSSEResponse([
      'event: text\ndata: {"content":"Hello "}\n\n',
      'event: text\ndata: {"content":"world!"}\n\n',
    ]);

    await state().handleStreamingResponse(response);

    const msgs = state().messages;
    expect(msgs).toHaveLength(1);
    const parts = (msgs[0] as any).parts;
    // Two consecutive text events should merge into one text part
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ type: 'text', content: 'Hello world!' });
  });

  /**
   * Verify that thinking and tool_start/tool_end events create
   * the correct message parts.
   */
  it('parses thinking, tool_start, and tool_end events', async () => {
    const response = createSSEResponse([
      'event: thinking\ndata: {"content":"Let me search..."}\n\n',
      'event: tool_start\ndata: {"id":"t1","tool_name":"search","args":{"q":"jazz"}}\n\n',
      'event: tool_end\ndata: {"id":"t1","result":{"tracks":3},"status":"success"}\n\n',
      'event: text\ndata: {"content":"Found 3 tracks"}\n\n',
    ]);

    await state().handleStreamingResponse(response);

    const parts = (state().messages[0] as any).parts;
    expect(parts).toHaveLength(3); // thinking + tool_call + text

    expect(parts[0]).toMatchObject({ type: 'thinking', content: 'Let me search...' });
    expect(parts[1]).toMatchObject({
      type: 'tool_call',
      id: 't1',
      tool_name: 'search',
      status: 'success',
      result: { tracks: 3 },
    });
    expect(parts[2]).toMatchObject({ type: 'text', content: 'Found 3 tracks' });
  });

  /**
   * The done event should collect actions; we verify via the onAgentActions callback.
   */
  it('handles done event and passes actions to callback', async () => {
    const actions: any[] = [];
    const onAgentActions = vi.fn(async (a: any[]) => {
      actions.push(...a);
    });

    const response = createSSEResponse([
      'event: text\ndata: {"content":"Playing now"}\n\n',
      'event: done\ndata: {"actions":[{"type":"play_track","data":{"id":"123"}}]}\n\n',
    ]);

    await state().handleStreamingResponse(response, onAgentActions);

    // Actions from the done event are executed in the finally block
    expect(onAgentActions).toHaveBeenCalledWith([
      { type: 'play_track', data: { id: '123' } },
    ]);
  });

  /**
   * The action event fires the onAgentActions callback immediately (real-time).
   */
  it('handles action events in real-time', async () => {
    const onAgentActions = vi.fn();

    const response = createSSEResponse([
      'event: action\ndata: {"type":"play_track","data":{"id":"456"}}\n\n',
      'event: text\ndata: {"content":"Done"}\n\n',
      'event: done\ndata: {"actions":[]}\n\n',
    ]);

    await state().handleStreamingResponse(response, onAgentActions);

    // First call is the real-time action event
    expect(onAgentActions).toHaveBeenCalledWith([
      { type: 'play_track', data: { id: '456' } },
    ]);
  });

  /**
   * Cross-chunk line splitting: an SSE line split across two TCP chunks
   * must still parse correctly thanks to the lineBuffer accumulation.
   */
  it('handles SSE lines split across chunks (lineBuffer)', async () => {
    // Split "event: text\n" across chunk boundary, and also split the data line
    const response = createSSEResponse([
      'event: te',             // partial "event: text"
      'xt\ndata: {"conte',     // completes event line, starts data line
      'nt":"fragmented"}\n\n', // completes data line
    ]);

    await state().handleStreamingResponse(response);

    const parts = (state().messages[0] as any).parts;
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ type: 'text', content: 'fragmented' });
  });

  /**
   * Multiple SSE events packed into a single chunk should all parse.
   */
  it('parses multiple events in a single chunk', async () => {
    const allInOne =
      'event: thinking\ndata: {"content":"hmm"}\n\n' +
      'event: text\ndata: {"content":"answer"}\n\n' +
      'event: done\ndata: {"actions":[]}\n\n';

    const response = createSSEResponse([allInOne]);
    await state().handleStreamingResponse(response);

    const parts = (state().messages[0] as any).parts;
    expect(parts).toHaveLength(2); // thinking + text
    expect(parts[0].type).toBe('thinking');
    expect(parts[1].type).toBe('text');
  });

  /**
   * Malformed JSON in a data line should be silently skipped
   * without crashing the stream.
   */
  it('skips malformed JSON without crashing', async () => {
    const response = createSSEResponse([
      'event: text\ndata: {INVALID JSON}\n\n',
      'event: text\ndata: {"content":"recovered"}\n\n',
    ]);

    await state().handleStreamingResponse(response);

    const parts = (state().messages[0] as any).parts;
    expect(parts).toHaveLength(1);
    expect(parts[0].content).toBe('recovered');
  });
});
