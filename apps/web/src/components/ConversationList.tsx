import { useRef, useEffect, useCallback } from 'react';
import { ConversationItem } from './ConversationItem';
import type { Conversation } from '../types/global.d.ts';

interface ConversationListProps {
  conversations: Conversation[];
  expanded: boolean;
  activeConversationId?: string | null;
  onSelectConversation?: (id: string) => void;
  onPinConversation?: (id: string, isPinned: boolean) => void;
  onRenameConversation?: (id: string, newTitle: string) => void;
  onDeleteConversation?: (id: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

export const ConversationList = ({
  conversations,
  expanded,
  activeConversationId,
  onSelectConversation,
  onPinConversation,
  onRenameConversation,
  onDeleteConversation,
  onLoadMore,
  hasMore,
  isLoadingMore,
}: ConversationListProps): React.JSX.Element => {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      if (entry?.isIntersecting && hasMore && !isLoadingMore && onLoadMore) {
        onLoadMore();
      }
    },
    [hasMore, isLoadingMore, onLoadMore],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: '100px',
    });
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [handleIntersect]);

  if (conversations.length === 0) {
    if (!expanded) return <></>;
    return (
      <div className="mx-2 p-3 text-gemini-subtext text-sm text-center">
        No conversations yet
      </div>
    );
  }

  return (
    <>
      {conversations.map((conv, idx) => (
        <ConversationItem
          key={conv.id || idx}
          conversation={conv}
          expanded={expanded}
          isActive={conv.id === activeConversationId}
          onSelect={onSelectConversation}
          onPin={onPinConversation}
          onRename={onRenameConversation}
          onDelete={onDeleteConversation}
        />
      ))}

      {/* Sentinel element for infinite scroll */}
      <div ref={sentinelRef} className="h-1" />

      {isLoadingMore && (
        <div className="flex justify-center py-2">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        </div>
      )}
    </>
  );
};
