import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { API_BASE } from '../config/api';
import type { Conversation } from '../types';

const PAGE_SIZE = 20;
const TITLE_POLL_INTERVAL = 3000;
const TITLE_POLL_MAX_ATTEMPTS = 20;

export function useConversations(userId: string | null | undefined, activeSessionId?: string | null) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const fetchConversations = useCallback(async () => {
    if (!userId) return;

    try {
      const res = await fetch(
        `${API_BASE}/conversations?user_id=${userId}&limit=${PAGE_SIZE}`,
      );
      const data = await res.json();
      setConversations(data.conversations || []);
      setHasMore(data.has_more || false);
      cursorRef.current = data.next_cursor || null;
    } catch (e) {
      console.error('Failed to fetch conversations:', e);
    }
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || isLoadingMore || !cursorRef.current) return;

    setIsLoadingMore(true);
    try {
      const res = await fetch(
        `${API_BASE}/conversations?user_id=${userId}&limit=${PAGE_SIZE}&cursor=${cursorRef.current}`,
      );
      const data = await res.json();
      const newConversations: Conversation[] = data.conversations || [];

      setConversations(prev => [...prev, ...newConversations]);
      setHasMore(data.has_more || false);
      cursorRef.current = data.next_cursor || null;
    } catch (e) {
      console.error('Failed to load more conversations:', e);
    } finally {
      setIsLoadingMore(false);
    }
  }, [userId, hasMore, isLoadingMore]);

  const handleDelete = useCallback(async (conversationId: string) => {
    if (!userId) return;

    const backup = [...conversations];

    // Optimistic update
    setConversations(prev => prev.filter(c => c.id !== conversationId));

    try {
      const res = await fetch(
        `${API_BASE}/conversations/${conversationId}?user_id=${userId}`,
        { method: 'DELETE' },
      );

      if (!res.ok) throw new Error('Delete failed');
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      setConversations(backup);
      toast.error('Failed to delete conversation', {
        description: 'Please try again',
        action: {
          label: 'Retry',
          onClick: () => handleDelete(conversationId),
        },
      });
    }
  }, [userId, conversations]);

  const handlePin = useCallback(async (conversationId: string, isPinned: boolean) => {
    if (!userId) return;

    // Optimistic update with sorting
    setConversations(prev => {
      const updated = prev.map(c =>
        c.id === conversationId ? { ...c, is_pinned: isPinned } : c,
      );
      return updated.sort((a, b) => {
        if (a.is_pinned === b.is_pinned) {
          return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
        }
        return (a.is_pinned ? -1 : 1) - (b.is_pinned ? -1 : 1);
      });
    });

    try {
      const res = await fetch(
        `${API_BASE}/conversations/${conversationId}?user_id=${userId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_pinned: isPinned }),
        },
      );

      if (!res.ok) throw new Error('Failed to update pin status');
    } catch (err) {
      console.error('Pin failed:', err);
      fetchConversations();
    }
  }, [userId, fetchConversations]);

  const handleRename = useCallback(async (conversationId: string, newTitle: string) => {
    if (!userId) return;

    // Optimistic update
    setConversations(prev =>
      prev.map(c =>
        c.id === conversationId ? { ...c, title: newTitle } : c,
      ),
    );

    try {
      const res = await fetch(
        `${API_BASE}/conversations/${conversationId}?user_id=${userId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle }),
        },
      );

      if (!res.ok) throw new Error('Failed to rename conversation');
    } catch (err) {
      console.error('Rename failed:', err);
      fetchConversations();
    }
  }, [userId, fetchConversations]);

  // ---------------------------------------------------------------------------
  // Poll for title when the active conversation has no title yet
  // ---------------------------------------------------------------------------
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  useEffect(() => {
    if (!userId || !activeSessionId) return;

    // Already has a title — skip
    const conv = conversationsRef.current.find(c => c.id === activeSessionId);
    if (conv?.title) return;

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `${API_BASE}/conversations/${activeSessionId}/title?user_id=${userId}`,
        );
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (data.title) {
          setConversations(prev =>
            prev.map(c =>
              c.id === activeSessionId ? { ...c, title: data.title } : c,
            ),
          );
          return; // Got title, stop polling
        }
      } catch { /* ignore */ }

      attempts++;
      if (!cancelled && attempts < TITLE_POLL_MAX_ATTEMPTS) {
        timer = setTimeout(poll, TITLE_POLL_INTERVAL);
      }
    };

    timer = setTimeout(poll, TITLE_POLL_INTERVAL);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [userId, activeSessionId]);

  return {
    conversations,
    setConversations,
    fetchConversations,
    loadMore,
    hasMore,
    isLoadingMore,
    handleDelete,
    handlePin,
    handleRename,
  };
}
