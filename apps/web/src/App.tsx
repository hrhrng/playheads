/**
 * Main application component
 * @module App
 */

import { useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { HomeRoute, ChatRoute } from './routes';
import { useMusicProvider } from './hooks/useMusicProvider';
import useAppleMusicLink from './hooks/useAppleMusicLink';
import { useDevTools } from './utils/devTools';
import { useAuth } from './hooks/useAuth';
import { useConversations } from './hooks/useConversations';
import { ToastProvider } from './components/ToastProvider';
import { LoadingScreen } from './components/LoadingScreen';
import { LoginScreen } from './components/LoginScreen';
import { WaitlistGate } from './components/WaitlistGate';
import { useWaitlistGate } from './hooks/useWaitlistGate';
import type { MusicActions } from './hooks/useAgentChatAdapter';

function App() {
  const location = useLocation();
  useDevTools();

  // Auth
  const {
    session,
    effectiveSession,
    isLoggedIn,
    isSessionLoading,
    isDev,
    email,
    setEmail,
    loading,
    authMessage,
    handleLogin,
    logout,
  } = useAuth();

  // Waitlist gate
  const waitlistStatus = useWaitlistGate(effectiveSession);

  // Extract active session ID from URL
  const pathParts = location.pathname.split('/');
  const activeSessionId = (pathParts[1] === 'chat' && pathParts[2]) ? pathParts[2] : null;

  // Conversations CRUD
  const {
    conversations,
    fetchConversations,
    handleDelete: handleDeleteConversation,
    handlePin: handlePinConversation,
    handleRename: handleRenameConversation,
    loadMore: loadMoreConversations,
    hasMore: hasMoreConversations,
    isLoadingMore: isLoadingMoreConversations,
  } = useConversations(session?.user?.id, activeSessionId);

  // Apple Music account linking
  const {
    storedMusicUserToken,
    isTokenChecked,
    linkApple,
  } = useAppleMusicLink(effectiveSession?.user.id || null, isSessionLoading);

  // Music provider (Apple Music) + global queue
  const {
    provider,
    playback,
    queue,
    storefrontId,
    isAuthorized: isAppleMusicAuthorized,
    isInitializing,
    login: appleMusicLogin,
    logout: appleMusicLogout,
  } = useMusicProvider({
    userId: effectiveSession?.user.id || null,
    storedMusicUserToken,
    isTokenChecked,
  });

  // Music actions dispatched by agent tool results
  const musicActions: MusicActions = useMemo(() => ({
    playTrack: async (index: number) => {
      await queue.playAtIndex(index);
    },
    addToQueue: async (_trackId: string) => {
      // Track is added via action dispatch in useAgentChatAdapter — queue.addTrack
      // This is called with the MusicKit track ID; the actual queue addition
      // happens in useAgentChatAdapter's action handler with full track data
    },
    skipNext: async () => {
      await queue.skipNext();
    },
    removeTrack: async (index: number) => {
      queue.removeTrack(index);
    },
    storefront: storefrontId,
  }), [queue, storefrontId]);

  // Wrapped playTrack for sidebar clicks
  const wrappedPlayTrack = useCallback(async (index: number) => {
    await queue.playAtIndex(index);
  }, [queue]);

  // Data fetching on login
  useEffect(() => {
    if (session?.user?.id) {
      fetchConversations();
    }
  }, [session?.user?.id]);

  // ============================================================================
  // Render
  // ============================================================================

  if (!isDev && (isSessionLoading || (isLoggedIn && isInitializing))) {
    return <LoadingScreen />;
  }

  if (!isLoggedIn) {
    return (
      <LoginScreen
        email={email}
        setEmail={setEmail}
        loading={loading}
        message={authMessage}
        onLogin={handleLogin}
      />
    );
  }

  if (!isDev && waitlistStatus !== 'approved') {
    return <WaitlistGate email={effectiveSession?.user?.email} onLogout={logout} />;
  }

  return (
    <>
      <ToastProvider />

      <Routes>
        <Route path="/" element={
          <HomeRoute
            session={effectiveSession}
            conversations={conversations}
            onDeleteConversation={handleDeleteConversation}
            onPinConversation={handlePinConversation}
            onRenameConversation={handleRenameConversation}
            onLoadMoreConversations={loadMoreConversations}
            hasMoreConversations={hasMoreConversations}
            isLoadingMoreConversations={isLoadingMoreConversations}
            isDJSpeaking={false}
            currentTrack={playback.currentTrack}
            isPlaying={playback.isPlaying}
            isTransitioning={playback.isTransitioning}
            isAppleMusicAuthorized={isAppleMusicAuthorized}
            togglePlay={() => provider?.togglePlay()}
            playbackTime={playback.playbackTime}
            seekTo={(t) => provider?.seekTo(t)}
            musicActions={musicActions}
            fetchConversations={fetchConversations}
            onLogout={logout}
            onLinkApple={linkApple}
            onDisconnectApple={appleMusicLogout}
            skipNext={() => queue.skipNext()}
            skipPrev={() => queue.skipPrev()}
            queue={queue}
            playTrackById={(id: string) => provider?.play(id) ?? Promise.resolve()}
          />
        } />

        <Route path="/chat/:id" element={
          <ChatRoute
            session={session}
            conversations={conversations}
            onDeleteConversation={handleDeleteConversation}
            onPinConversation={handlePinConversation}
            onRenameConversation={handleRenameConversation}
            onLoadMoreConversations={loadMoreConversations}
            hasMoreConversations={hasMoreConversations}
            isLoadingMoreConversations={isLoadingMoreConversations}
            isDJSpeaking={false}
            currentTrack={playback.currentTrack}
            isPlaying={playback.isPlaying}
            isTransitioning={playback.isTransitioning}
            isAppleMusicAuthorized={isAppleMusicAuthorized}
            togglePlay={() => provider?.togglePlay()}
            playbackTime={playback.playbackTime}
            seekTo={(t) => provider?.seekTo(t)}
            playAppleTrack={wrappedPlayTrack}
            musicActions={musicActions}
            fetchConversations={fetchConversations}
            onLogout={logout}
            onLinkApple={linkApple}
            onDisconnectApple={appleMusicLogout}
            skipNext={() => queue.skipNext()}
            skipPrev={() => queue.skipPrev()}
            queue={queue}
            playTrackById={(id: string) => provider?.play(id) ?? Promise.resolve()}
          />
        } />
      </Routes>
    </>
  );
}

export default App;
