import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConversations } from '../useConversations';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock toast
vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

describe('useConversations', () => {
  const userId = 'user-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with empty conversations', () => {
    const { result } = renderHook(() => useConversations(userId));
    expect(result.current.conversations).toEqual([]);
  });

  it('fetchConversations loads conversations from API', async () => {
    const convs = [
      { id: 'c1', title: 'Chat 1', message_count: 1, is_pinned: false },
    ];
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ conversations: convs }),
    });

    const { result } = renderHook(() => useConversations(userId));

    await act(async () => {
      await result.current.fetchConversations();
    });

    expect(result.current.conversations).toEqual(convs);
  });

  it('fetchConversations does nothing without userId', async () => {
    const { result } = renderHook(() => useConversations(null));

    await act(async () => {
      await result.current.fetchConversations();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handleDelete optimistically removes conversation', async () => {
    mockFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ conversations: [
          { id: 'c1', title: 'A', message_count: 0, is_pinned: false },
          { id: 'c2', title: 'B', message_count: 0, is_pinned: false },
        ]}),
      })
      .mockResolvedValueOnce({ ok: true }); // DELETE response

    const { result } = renderHook(() => useConversations(userId));

    await act(async () => {
      await result.current.fetchConversations();
    });
    expect(result.current.conversations).toHaveLength(2);

    await act(async () => {
      await result.current.handleDelete('c1');
    });

    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].id).toBe('c2');
  });

  it('handleDelete rolls back on API failure', async () => {
    mockFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ conversations: [
          { id: 'c1', title: 'A', message_count: 0, is_pinned: false },
        ]}),
      })
      .mockResolvedValueOnce({ ok: false }); // DELETE fails

    const { result } = renderHook(() => useConversations(userId));

    await act(async () => {
      await result.current.fetchConversations();
    });

    await act(async () => {
      await result.current.handleDelete('c1');
    });

    // Should be rolled back
    expect(result.current.conversations).toHaveLength(1);
  });

  it('handlePin optimistically updates and sorts', async () => {
    mockFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ conversations: [
          { id: 'c1', title: 'A', message_count: 0, is_pinned: false, updated_at: '2024-01-01' },
          { id: 'c2', title: 'B', message_count: 0, is_pinned: false, updated_at: '2024-01-02' },
        ]}),
      })
      .mockResolvedValueOnce({ ok: true }); // PATCH response

    const { result } = renderHook(() => useConversations(userId));

    await act(async () => {
      await result.current.fetchConversations();
    });

    await act(async () => {
      await result.current.handlePin('c1', true);
    });

    // c1 should be first (pinned)
    expect(result.current.conversations[0].id).toBe('c1');
    expect(result.current.conversations[0].is_pinned).toBe(true);
  });

  it('handleRename optimistically updates title', async () => {
    mockFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ conversations: [
          { id: 'c1', title: 'Old', message_count: 0, is_pinned: false },
        ]}),
      })
      .mockResolvedValueOnce({ ok: true }); // PATCH response

    const { result } = renderHook(() => useConversations(userId));

    await act(async () => {
      await result.current.fetchConversations();
    });

    await act(async () => {
      await result.current.handleRename('c1', 'New Title');
    });

    expect(result.current.conversations[0].title).toBe('New Title');
  });
});
