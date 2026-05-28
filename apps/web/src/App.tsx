/**
 * Main application component
 * @module App
 */

import { useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { HomeRoute, ChatRoute } from './routes';
import { useMusicProvider } from './hooks/useMusicProvider';
import useAppleMusicLink from './hooks/useAppleMusicLink';
import { useAlbumPalette } from './hooks/useAlbumPalette';
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
    isAppleLinked,
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
    isInitializing,
    login: appleMusicLogin,
    logout: appleMusicLogout,
  } = useMusicProvider({
    userId: effectiveSession?.user.id || null,
    storedMusicUserToken,
    isTokenChecked,
  });

  // Connection status is ACCOUNT-level: driven by the backend profile token
  // (isAppleLinked), not MusicKit's browser-cached session. MusicKit persists
  // the Music User Token per-browser, so reading provider.isAuthorized made a
  // brand-new account inherit a stale "connected" badge from whoever linked
  // on this device before. The backend profile is the source of truth;
  // provider.isAuthorized stays internal to the provider for playback.
  const isAppleMusicAuthorized = isAppleLinked;

  // Album-driven palette: extract colours from the current track's artwork
  // and pipe them into CSS vars on <html>. Empty state stays neutral.
  useAlbumPalette(playback.currentTrack?.artworkUrl);

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

  // Gate the shell until *everything* is settled:
  //   1. session lookup finishes (avoid flashing login)
  //   2. MusicKit provider has initialized (isInitializing false)
  //   3. localStorage queue restore has finished (queue.isRestoring false)
  //   4. /api/profile bootstrap (covered by isInitializing via provider)
  // Otherwise the user can click Play before MusicKit has the queue
  // attached, which leads to "queue cleared", wrong seek position, etc.
  const stillBooting =
    isSessionLoading || (isLoggedIn && (isInitializing || queue.isRestoring));
  if (!isDev && stillBooting) {
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
            queue={queue}
            playTrackById={(id: string) => provider?.play(id) ?? Promise.resolve()}
          />
        } />
      </Routes>
    </>
  );
}

export default App;
