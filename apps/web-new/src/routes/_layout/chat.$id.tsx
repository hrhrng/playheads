
import { createFileRoute, useOutletContext } from '@tanstack/react-router';
import { ChatInterface } from '../../components/ChatInterface';
import { SyncTrack } from '../../hooks/useAppleMusic';
import { Session } from '@supabase/supabase-js';
import { useState } from 'react';

interface LayoutContext {
    session: Session | null;
    isDJSpeaking: boolean;
    appleTrack: SyncTrack | null;
    isApplePlaying: boolean;
    toggleApple: () => void;
    playbackTime: { current: number; total: number };
    seekTo: (time: number) => void;
    appleQueue: SyncTrack[];
    playAppleTrack: (index: number) => void;
    syncToBackend: (data?: any, targetSessionId?: string | null) => Promise<void>;
    executeAgentActions: (actions: string[]) => Promise<void>;
    fetchConversations: () => Promise<void>;
    setIsDJSpeaking: (isSpeaking: boolean) => void;
}

export const Route = createFileRoute('/_layout/chat/$id')({
  component: ChatComponent,
})

function ChatComponent() {
  const { id } = Route.useParams();
  const context = useOutletContext<LayoutContext>();
  const [isChatEmpty, setIsChatEmpty] = useState(false); // To possibly hide sidebar if needed

  const {
      session,
      isDJSpeaking,
      appleTrack,
      isApplePlaying,
      toggleApple,
      playbackTime,
      seekTo,
      syncToBackend,
      executeAgentActions,
      fetchConversations
  } = context;

  const handleSessionCreated = (newSessionId: string, preservedMessages: any[], initialMessage: string) => {
       fetchConversations();
  };

  return (
      <div className="h-full w-full flex flex-col relative z-10">
        <ChatInterface
          isDJSpeaking={isDJSpeaking}
          currentTrack={appleTrack}
          isPlaying={isApplePlaying}
          togglePlay={toggleApple}
          playbackTime={playbackTime}
          onSeek={seekTo}
          sessionId={id}
          onAgentActions={executeAgentActions}
          syncToBackend={(data) => syncToBackend(data, id)}
          userId={session?.user?.id || null}
          onMessageSent={fetchConversations}
          onSessionCreated={handleSessionCreated}
          isNewChat={false}
        />
      </div>
  );
}
