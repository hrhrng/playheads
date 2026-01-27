
import { createFileRoute, useOutletContext } from '@tanstack/react-router';
import { ChatInterface } from '../components/ChatInterface';
import { SyncTrack } from '../hooks/useAppleMusic';
import { Session } from '@supabase/supabase-js';

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

export const Route = createFileRoute('/_layout/')({
  component: IndexComponent,
})

function IndexComponent() {
  const context = useOutletContext<LayoutContext>();
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
      // Logic handled in useChat hook mostly, but here we might just log
      console.log("Session created:", newSessionId);
      // fetchConversations will be called by useChat or ChatInterface callbacks
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
          sessionId={null}
          onAgentActions={executeAgentActions}
          syncToBackend={(data) => syncToBackend(data, null)}
          userId={session?.user?.id || null}
          onMessageSent={fetchConversations}
          onSessionCreated={handleSessionCreated}
          isNewChat={true}
        />
      </div>
  );
}
