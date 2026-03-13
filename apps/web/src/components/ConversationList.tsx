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
}

export const ConversationList = ({
  conversations,
  expanded,
  activeConversationId,
  onSelectConversation,
  onPinConversation,
  onRenameConversation,
  onDeleteConversation,
}: ConversationListProps): React.JSX.Element => {
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
    </>
  );
};
