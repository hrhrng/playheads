/**
 * Main application component
 * @module App
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { HomeRoute, ChatRoute } from './routes';
import useAppleMusic from './hooks/useAppleMusic';
import useAppleMusicLink from './hooks/useAppleMusicLink';
import { useDevTools } from './utils/devTools';
import { useAuth } from './hooks/useAuth';
import { useConversations } from './hooks/useConversations';
import { ToastProvider } from './components/ToastProvider';
import { LoadingScreen } from './components/LoadingScreen';
import { LoginScreen } from './components/LoginScreen';
import { WaitlistGate } from './components/WaitlistGate';
import { useWaitlistGate } from './hooks/useWaitlistGate';
import { useChatStore } from './store/chatStore';
import type { MusicActions } from './hooks/useAgentChatAdapter';

function App() {
  const location = useLocation();
  useDevTools();

  // Auth
  const {
    session,
    effectiveSession,
    isLoggedIn,
    isDev,
    email,
    setEmail,
    loading,
    authMessage,
    handleLogin,
    logout,
  } = useAuth();

  // Waitlist gate (reads user_metadata from session, no external dependency)
  const waitlistStatus = useWaitlistGate(effectiveSession);

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
  } = useConversations(session?.user?.id);

  // Per-conversation playback state
  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);
  const viewedPlaylist = useChatStore(s => s.viewedPlaylist);
  const setViewedPlaylist = useChatStore(s => s.setViewedPlaylist);
  const initialRestoreDone = useRef(false);
  const playlistSyncReady = useRef(false);

  // Extract active session ID from URL
  const pathParts = location.pathname.split('/');
  const activeSessionId = (pathParts[1] === 'chat' && pathParts[2]) ? pathParts[2] : null;

  // Apple Music account linking
  const {
    storedMusicUserToken,
    isTokenChecked,
    linkApple,
  } = useAppleMusicLink(effectiveSession?.user.id || null);

  // Apple Music hook
  const {
    currentTrack: appleTrack,
    isPlaying: isApplePlaying,
    isTransitioning: isAppleTransitioning,
    isAuthorized: isAppleMusicAuthorized,
    togglePlay: toggleApple,
    queue: appleQueue,
    playTrack: playAppleTrack,
    isInitializing,
    playbackTime,
    seekTo,
    logout: appleMusicLogout,
    agentPlayTrack,
    agentAddToQueue,
    agentSkipNext,
    agentRemoveTrack,
    syncMusicKitState,
    syncPlaylistToBackend,
    restoreStateFromBackend,
    updatePlayingPlaylist,
  } = useAppleMusic({
    userId: effectiveSession?.user.id || null,
    activeSessionId,
    syncSessionId: playingSessionId,
    storedMusicUserToken,
    isTokenChecked,
  });

  // ============================================================================
  // Per-conversation playback logic
  // ============================================================================

  const isViewingPlayingConversation = !!playingSessionId && playingSessionId === activeSessionId;

  // Ensure the playing session is set before executing any agent action
  const ensurePlayingSession = useCallback(() => {
    if (activeSessionId) {
      setPlayingSessionId(activeSessionId);
      updatePlayingPlaylist(activeSessionId, useChatStore.getState().viewedPlaylist);
    }
  }, [activeSessionId, updatePlayingPlaylist]);

  // Music actions dispatched as side effects when tool results contain _action.
  // Fire-and-forget (no return value) — matches old executeAgentActions pattern.
  const musicActions: MusicActions = useMemo(() => ({
    playTrack: async (index: number) => {
      ensurePlayingSession();
      await agentPlayTrack(index);
    },
    addToQueue: async (trackId: string) => {
      ensurePlayingSession();
      await agentAddToQueue(trackId);
    },
    skipNext: async () => {
      ensurePlayingSession();
      await agentSkipNext();
    },
    removeTrack: async (index: number) => {
      ensurePlayingSession();
      await agentRemoveTrack(index);
    },
  }), [ensurePlayingSession, agentPlayTrack, agentAddToQueue, agentSkipNext, agentRemoveTrack]);

  const wrappedPlayAppleTrack = useCallback(async (index: number) => {
    if (activeSessionId) {
      setPlayingSessionId(activeSessionId);
      updatePlayingPlaylist(activeSessionId, useChatStore.getState().viewedPlaylist);
    }
    await playAppleTrack(index);
  }, [activeSessionId, playAppleTrack, updatePlayingPlaylist]);

  // Initial restore on Apple Music authorization
  useEffect(() => {
    if (!isAppleMusicAuthorized || isInitializing || initialRestoreDone.current) return;
    if (!activeSessionId) return;

    initialRestoreDone.current = true;

    const alreadyPlayingElsewhere = playingSessionId && playingSessionId !== activeSessionId;
    const restoreSessionId = alreadyPlayingElsewhere ? playingSessionId : activeSessionId;

    let cancelled = false;
    (async () => {
      const data = await restoreStateFromBackend(restoreSessionId);
      if (!cancelled && data) {
        updatePlayingPlaylist(restoreSessionId, data.playlist || []);

        if (!alreadyPlayingElsewhere) {
          // Only overwrite local playlist if backend has actual data;
          // otherwise keep the locally-created playlist (e.g. from SSE actions
          // before Apple Music was connected).
          const backendPlaylist = data.playlist || [];
          if (backendPlaylist.length > 0 || viewedPlaylist.length === 0) {
            setViewedPlaylist(backendPlaylist);
          }
          setPlayingSessionId(activeSessionId);
        }
      }
      playlistSyncReady.current = true;
    })();
    return () => { cancelled = true; initialRestoreDone.current = false; };
  }, [isAppleMusicAuthorized, isInitializing, activeSessionId, playingSessionId, restoreStateFromBackend, updatePlayingPlaylist]);

  // ============================================================================
  // Debounced playlist sync to backend
  // ============================================================================
  const playlistSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedPlaylistRef = useRef<string>('');
  const lastSyncedSessionRef = useRef<string | null>(null);
  // With useAgentChat, messages load automatically via WebSocket —
  // no separate loading state needed. Enable playlist sync immediately.
  useEffect(() => {
    playlistSyncReady.current = true;
  }, []);

  useEffect(() => {
    // Don't sync until history has loaded at least once — otherwise the empty
    // default viewedPlaylist overwrites the real playlist in the backend.
    if (!playlistSyncReady.current) return;
    if (activeSessionId !== lastSyncedSessionRef.current) {
      lastSyncedSessionRef.current = activeSessionId;
      lastSyncedPlaylistRef.current = '';
    }
    if (!activeSessionId || !effectiveSession?.user?.id) return;

    const serialized = JSON.stringify(viewedPlaylist.map(t => t.id));
    if (serialized === lastSyncedPlaylistRef.current) return;

    if (playlistSyncTimer.current) clearTimeout(playlistSyncTimer.current);
    playlistSyncTimer.current = setTimeout(() => {
      lastSyncedPlaylistRef.current = serialized;
      updatePlayingPlaylist(activeSessionId, viewedPlaylist);
      syncPlaylistToBackend(viewedPlaylist);
    }, 500);

    return () => {
      if (playlistSyncTimer.current) clearTimeout(playlistSyncTimer.current);
    };
  }, [viewedPlaylist, activeSessionId, effectiveSession?.user?.id, syncPlaylistToBackend, updatePlayingPlaylist]);

  const startPlaybackFromConversation = useCallback(async (trackIndex: number) => {
    if (!activeSessionId) return;

    if (playingSessionId && playingSessionId !== activeSessionId) {
      await syncMusicKitState();
    }

    const data = await restoreStateFromBackend(activeSessionId);
    const restoredPlaylist = data?.playlist || [];

    updatePlayingPlaylist(activeSessionId, restoredPlaylist);
    await playAppleTrack(trackIndex);

    setPlayingSessionId(activeSessionId);
    setViewedPlaylist(restoredPlaylist);
  }, [activeSessionId, playingSessionId, syncMusicKitState, restoreStateFromBackend, playAppleTrack, updatePlayingPlaylist]);

  // ============================================================================
  // Data fetching on login
  // ============================================================================

  useEffect(() => {
    if (session?.user?.id) {
      fetchConversations();
    }
  }, [session?.user?.id]);

  // ============================================================================
  // Render
  // ============================================================================

  if (!isDev && isInitializing) {
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
            appleTrack={appleTrack}
            isApplePlaying={isApplePlaying}
            isAppleTransitioning={isAppleTransitioning}
            isAppleMusicAuthorized={isAppleMusicAuthorized}
            toggleApple={toggleApple}
            playbackTime={playbackTime}
            seekTo={seekTo}
            musicActions={musicActions}
            fetchConversations={fetchConversations}
            onLogout={logout}
            onLinkApple={linkApple}
            onDisconnectApple={appleMusicLogout}
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
            appleTrack={appleTrack}
            isApplePlaying={isApplePlaying}
            isAppleTransitioning={isAppleTransitioning}
            isAppleMusicAuthorized={isAppleMusicAuthorized}
            toggleApple={toggleApple}
            playbackTime={playbackTime}
            seekTo={seekTo}
            appleQueue={appleQueue}
            playAppleTrack={wrappedPlayAppleTrack}
            musicActions={musicActions}
            fetchConversations={fetchConversations}
            onLogout={logout}
            onLinkApple={linkApple}
            onDisconnectApple={appleMusicLogout}
            viewedPlaylist={viewedPlaylist}
            isViewingPlayingConversation={isViewingPlayingConversation}
            onStartPlaybackFromConversation={startPlaybackFromConversation}
            playingSessionId={playingSessionId}
          />
        } />
      </Routes>
    </>
  );
}

export default App;
