/**
 * Route components - Separated page-level components for each route
 * @module routes
 */

import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { ChatInterface } from '../components/ChatInterface';
import { PlaylistSidebar } from '../components/PlaylistSidebar';
import { useSidebarState } from '../hooks/useSidebarState';
import { supabase } from '../utils/supabase';
import type {
  Track,
  PlaybackTime,
  Message,
  AgentAction,
  SupabaseSession,
  Conversation
} from '../types';

interface RouteComponentProps {
  session: SupabaseSession | null;
  conversations: Conversation[];
  onDeleteConversation: (id: string) => void;
  onPinConversation: (id: string, pinned: boolean) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  isDJSpeaking: boolean;
  appleTrack: Track | null;
  isApplePlaying: boolean;
  toggleApple: () => void;
  playbackTime: PlaybackTime;
  seekTo: (time: number) => void;
  appleQueue?: Track[];
  playAppleTrack?: (index: number) => Promise<void>;
  executeAgentActions: (actions: string[]) => Promise<void>;
  fetchConversations: () => Promise<void>;
}

/**
 * Home Route (/) - New chat page without sidebar
 */
export function HomeRoute({
  session,
  conversations,
  onDeleteConversation,
  onPinConversation,
  onRenameConversation,
  isDJSpeaking,
  appleTrack,
  isApplePlaying,
  toggleApple,
  playbackTime,
  seekTo,
  executeAgentActions,
  fetchConversations
}: RouteComponentProps) {
  const navigate = useNavigate();

  const handleSessionCreated = (
    newSessionId: string,
    preservedMessages: Message[],
    initialMessage: string
  ): void => {
    navigate(`/chat/${newSessionId}`, {
      replace: true,
      state: {
        isNewlyCreated: true,
        preservedMessages,
        initialMessage
      }
    });
    fetchConversations();
  };

  return (
    <AppLayout
      onNewChat={() => navigate('/')}
      onSelectConversation={(id) => navigate(`/chat/${id}`)}
      onDeleteConversation={onDeleteConversation}
      onPinConversation={onPinConversation}
      onRenameConversation={onRenameConversation}
      conversations={conversations}
      activeConversationId={null}
      rightPanel={null}
    >
      <ChatInterface
        isDJSpeaking={isDJSpeaking}
        currentTrack={appleTrack}
        isPlaying={isApplePlaying}
        togglePlay={toggleApple}
        playbackTime={playbackTime}
        onSeek={seekTo}
        sessionId={null}
        userId={session?.user.id || null}
        onAgentActions={async (actions: AgentAction[]) => {
          const actionStrings = actions
            .filter((a) => a.type === 'play_track')
            .map((a) => `ACTION:PLAY_INDEX:${a.data?.index}`);
          await executeAgentActions(actionStrings);
        }}
        onMessageSent={fetchConversations}
        onSessionCreated={handleSessionCreated}
      />
    </AppLayout>
  );
}

/**
 * Chat Route (/chat/:id) - Chat page with sidebar
 */
export function ChatRoute({
  session,
  conversations,
  onDeleteConversation,
  onPinConversation,
  onRenameConversation,
  isDJSpeaking,
  appleTrack,
  isApplePlaying,
  toggleApple,
  playbackTime,
  seekTo,
  appleQueue = [],
  playAppleTrack,
  executeAgentActions,
  fetchConversations
}: RouteComponentProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Sidebar state with persistence
  const { collapsed, width, toggleCollapse, setWidth } = useSidebarState();

  const sessionId = id === 'pending' ? null : (id ?? null);

  const handleSessionCreated = (
    newSessionId: string,
    preservedMessages: Message[],
    initialMessage: string
  ): void => {
    navigate(`/chat/${newSessionId}`, {
      replace: true,
      state: {
        isNewlyCreated: true,
        preservedMessages,
        initialMessage
      }
    });
    fetchConversations();
  };

  return (
    <AppLayout
      onNewChat={() => navigate('/')}
      onSelectConversation={(convId) => navigate(`/chat/${convId}`)}
      onDeleteConversation={onDeleteConversation}
      onPinConversation={onPinConversation}
      onRenameConversation={onRenameConversation}
      conversations={conversations}
      activeConversationId={id}
      rightPanel={
        <PlaylistSidebar
          currentTrack={appleTrack}
          isPlaying={isApplePlaying}
          queue={appleQueue}
          onPlayTrack={playAppleTrack}
          collapsed={collapsed}
          toggleCollapse={toggleCollapse}
          width={width}
          onWidthChange={setWidth}
        />
      }
    >
      <ChatInterface
        isDJSpeaking={isDJSpeaking}
        currentTrack={appleTrack}
        isPlaying={isApplePlaying}
        togglePlay={toggleApple}
        playbackTime={playbackTime}
        onSeek={seekTo}
        sessionId={sessionId}
        userId={session?.user.id || null}
        onAgentActions={async (actions: AgentAction[]) => {
          const actionStrings = actions
            .filter((a) => a.type === 'play_track')
            .map((a) => `ACTION:PLAY_INDEX:${a.data?.index}`);
          await executeAgentActions(actionStrings);
        }}
        onMessageSent={fetchConversations}
        onSessionCreated={handleSessionCreated}
      />
    </AppLayout>
  );
}
