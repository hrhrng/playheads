import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { API_BASE } from '../config/api';
import type { Conversation } from '../types';

export function useConversations(userId: string | null | undefined) {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const fetchConversations = useCallback(async () => {
    if (!userId) return;

    try {
      const res = await fetch(`${API_BASE}/conversations?user_id=${userId}`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (e) {
      console.error('Failed to fetch conversations:', e);
    }
  }, [userId]);

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

  return {
    conversations,
    setConversations,
    fetchConversations,
    handleDelete,
    handlePin,
    handleRename,
  };
}
