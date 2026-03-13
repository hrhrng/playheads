/**
 * Main application component
 * @module App
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { HomeRoute, ChatRoute } from './routes';
import useAppleMusic from './hooks/useAppleMusic';
import useAppleMusicLink from './hooks/useAppleMusicLink';
import { useDevTools } from './utils/devTools';
import { supabase } from './utils/supabase';
import { ToastProvider } from './components/ToastProvider';
import { API_BASE } from './config/api';
import { useChatStore } from './store/chatStore';
import type { SupabaseSession, Conversation, FormattedTrack } from './types';

// ============================================================================
// Types
// ============================================================================

interface AuthMessage {
  type: 'error' | 'success';
  text: string;
}

// ============================================================================
// Components
// ============================================================================

/**
 * Loading screen shown during initialization
 */
function LoadingScreen() {
  return (
    <div className="min-h-screen w-full bg-air-50 flex items-center justify-center">
      <div className="w-16 h-16 rounded-full overflow-hidden grayscale animate-pulse">
        <img src="/logo.jpg" alt="Loading" className="w-full h-full object-cover" />
      </div>
    </div>
  );
}

/**
 * Login screen for authentication
 */
function LoginScreen({
  email,
  setEmail,
  loading,
  message,
  onLogin
}: {
  email: string;
  setEmail: (email: string) => void;
  loading: boolean;
  message: AuthMessage | null;
  onLogin: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <div className="min-h-screen w-full bg-air-50 flex flex-col items-center justify-center p-6 relative">
      <div className="flex flex-col items-center space-y-12 max-w-sm w-full animate-fade-in">
        {/* Logo */}
        <div className="w-40 h-40 rounded-full overflow-hidden grayscale hover:grayscale-0 transition-all duration-700">
          <img src="/logo.jpg" alt="Playhead" className="w-full h-full object-cover scale-105" />
        </div>

        {/* Title */}
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight text-air-900 font-sans">Playhead</h1>
          <div className="h-px w-12 bg-air-200 mx-auto" />
          <p className="text-xs font-mono text-air-400 uppercase tracking-widest">Sonic Intelligence</p>
        </div>

        {/* Login Form */}
        <form onSubmit={onLogin} className="w-full space-y-4 pt-4">
          {message && (
            <div className={`p-3 text-sm rounded-md text-center ${
              message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
            }`}>
              {message.text}
            </div>
          )}

          <input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full h-12 px-4 rounded-lg border border-air-200 focus:outline-none focus:border-air-900 transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-lg bg-black text-white font-medium text-sm transition-colors flex items-center justify-center gap-3 hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? 'Sending Magic Link...' : 'Sign In with Email'}
          </button>
        </form>

        <div className="absolute bottom-8 text-air-300 text-[10px] font-mono">v2.1.0</div>
      </div>
    </div>
  );
}

// ============================================================================
// Main App Component
// ============================================================================

function App() {
  const location = useLocation();
  // Initialize dev tools in development
  useDevTools();

  // Auth state
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [email, setEmail] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [authMessage, setAuthMessage] = useState<AuthMessage | null>(null);

  // Dev mode: skip auth with ?dev=1
  const isDev = import.meta.env.DEV && new URLSearchParams(window.location.search).has('dev');
  const devSession: SupabaseSession = {
    access_token: 'dev',
    refresh_token: 'dev',
    expires_in: 99999,
    token_type: 'bearer',
    user: { id: 'dev-user', email: 'dev@playhead.local' },
  };
  const effectiveSession = isDev ? devSession : session;
  const isLoggedIn = !!effectiveSession;

  // Data state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isDJSpeaking] = useState<boolean>(false);

  // Per-conversation playback state
  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);
  const viewedPlaylist = useChatStore(s => s.viewedPlaylist);
  const setViewedPlaylist = useChatStore(s => s.setViewedPlaylist);
  const initialRestoreDone = useRef(false);

  // Extract active session ID from URL
  const pathParts = location.pathname.split('/');
  const activeSessionId = (pathParts[1] === 'chat' && pathParts[2]) ? pathParts[2] : null;

  // Apple Music account linking (checks on page load via toast)
  const {
    storedMusicUserToken,
    linkApple,
  } = useAppleMusicLink(effectiveSession?.user.id || null);

  // Apple Music hook
  const {
    currentTrack: appleTrack,
    isPlaying: isApplePlaying,
    isAuthorized: isAppleMusicAuthorized,
    togglePlay: toggleApple,
    queue: appleQueue,
    playTrack: playAppleTrack,
    isInitializing,
    playbackTime,
    seekTo,
    logout: appleMusicLogout,
    executeAgentActions: rawExecuteAgentActions,
    syncMusicKitState,
    syncPlaylistToBackend,
    restoreStateFromBackend,
    updatePlayingPlaylist,
  } = useAppleMusic({
    userId: effectiveSession?.user.id || null,
    activeSessionId,
    syncSessionId: playingSessionId,
    storedMusicUserToken,
  });

  // ============================================================================
  // Per-conversation playback logic
  // ============================================================================

  // Derived state
  const isViewingPlayingConversation = !!playingSessionId && playingSessionId === activeSessionId;

  // Wrap executeAgentActions to track which session owns playback
  // Even without full auth, MusicKit allows ~5s previews, so always attempt playback.
  const executeAgentActions = useCallback(async (actions: import('./types').AgentAction[]) => {
    if (activeSessionId) {
      setPlayingSessionId(activeSessionId);
      updatePlayingPlaylist(activeSessionId, useChatStore.getState().viewedPlaylist);
    }
    await rawExecuteAgentActions(actions);
  }, [activeSessionId, rawExecuteAgentActions, updatePlayingPlaylist]);

  // Wrap playAppleTrack to also set playingSessionId when user clicks sidebar tracks
  const wrappedPlayAppleTrack = useCallback(async (index: number) => {
    if (activeSessionId) {
      setPlayingSessionId(activeSessionId);
      updatePlayingPlaylist(activeSessionId, useChatStore.getState().viewedPlaylist);
    }
    await playAppleTrack(index);
  }, [activeSessionId, playAppleTrack, updatePlayingPlaylist]);

  // Initial restore: when Apple Music first authorizes, restore MusicKit from backend.
  // Runs once (initialRestoreDone ref guard).
  //
  // Corner case: user may connect Apple Music while viewing conversation B,
  // but playback was started from conversation A. In that case we must restore
  // A's playlist into MusicKit (so playback continues), keep playingSessionId
  // pointing to A, and NOT touch viewedPlaylist (which shows B's tracks).
  useEffect(() => {
    if (!isAppleMusicAuthorized || isInitializing || initialRestoreDone.current) return;
    if (!activeSessionId) return;

    initialRestoreDone.current = true;

    // If playback is already owned by a different session, restore from THAT
    // session so MusicKit picks up where it left off. Don't touch
    // viewedPlaylist or playingSessionId — they're already correct.
    const alreadyPlayingElsewhere = playingSessionId && playingSessionId !== activeSessionId;
    const restoreSessionId = alreadyPlayingElsewhere ? playingSessionId : activeSessionId;

    let cancelled = false;
    (async () => {
      const data = await restoreStateFromBackend(restoreSessionId);
      if (!cancelled && data) {
        updatePlayingPlaylist(restoreSessionId, data.playlist || []);

        if (!alreadyPlayingElsewhere) {
          // No cross-session playback — normal restore for the viewed session
          setViewedPlaylist(data.playlist || []);
          setPlayingSessionId(activeSessionId);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isAppleMusicAuthorized, isInitializing, activeSessionId, playingSessionId, restoreStateFromBackend, updatePlayingPlaylist]);

  // ============================================================================
  // Debounced playlist sync to backend
  //
  // Problem: SSE action events (add_to_queue, remove_track) update
  // chatStore.viewedPlaylist on the frontend, but nothing was persisting those
  // changes to the DB. On page refresh the playlist was gone.
  //
  // Solution: watch viewedPlaylist and debounce-sync to /state/sync after 500ms.
  //
  // Guards:
  //  - isLoadingHistory: skip while loadHistory is in flight, otherwise the
  //    initial empty viewedPlaylist would overwrite real backend data.
  //  - lastSyncedPlaylistRef: dedup by serialized track IDs so loading the
  //    same playlist from backend doesn't trigger a redundant sync.
  //  - lastSyncedSessionRef: reset the dedup tracker on session switch so
  //    two sessions with identical playlists still sync correctly.
  // ============================================================================
  const playlistSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedPlaylistRef = useRef<string>('');
  const lastSyncedSessionRef = useRef<string | null>(null);
  const isLoadingHistory = useChatStore(s => s.isLoadingHistory);

  useEffect(() => {
    if (isLoadingHistory) return;

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
  }, [viewedPlaylist, activeSessionId, effectiveSession?.user?.id, isLoadingHistory, syncPlaylistToBackend, updatePlayingPlaylist]);

  // Start playback from a non-playing conversation
  const startPlaybackFromConversation = useCallback(async (trackIndex: number) => {
    if (!activeSessionId) return;

    // Save current playing session's state first
    if (playingSessionId && playingSessionId !== activeSessionId) {
      await syncMusicKitState();
    }

    // Restore viewed conversation's playlist into MusicKit
    const data = await restoreStateFromBackend(activeSessionId);
    const restoredPlaylist = data?.playlist || [];

    // Update refs before playback so syncMusicKitState reads the correct session/playlist
    updatePlayingPlaylist(activeSessionId, restoredPlaylist);

    // Play the selected track (reads from refs)
    await playAppleTrack(trackIndex);

    // Update React state
    setPlayingSessionId(activeSessionId);
    setViewedPlaylist(restoredPlaylist);
  }, [activeSessionId, playingSessionId, syncMusicKitState, restoreStateFromBackend, playAppleTrack, updatePlayingPlaylist]);

  // ============================================================================
  // Auth Effects
  // ============================================================================

  useEffect(() => {
    // Check active session and subscribe to auth changes
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session as SupabaseSession | null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session as SupabaseSession | null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ============================================================================
  // Data Fetching
  // ============================================================================

  const fetchConversations = async (): Promise<void> => {
    if (!session?.user.id) return;

    try {
      const res = await fetch(`${API_BASE}/conversations?user_id=${session.user.id}`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (e) {
      console.error('Failed to fetch conversations:', e);
    }
  };

  useEffect(() => {
    if (session?.user.id) {
      fetchConversations();
    }
  }, [session?.user?.id]);

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setLoading(true);
    setAuthMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    });

    if (error) {
      setAuthMessage({ type: 'error', text: error.message });
    } else {
      setAuthMessage({ type: 'success', text: 'Check your email for the login link!' });
    }
    setLoading(false);
  };

  const handleDeleteConversation = async (conversationId: string): Promise<void> => {
    if (!session?.user?.id) return;

    const isActiveConversation = location.pathname === `/chat/${conversationId}`;
    const backup = [...conversations];

    // Optimistic update
    setConversations(prev => prev.filter(c => c.id !== conversationId));

    if (isActiveConversation) {
      window.location.href = '/';
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE}/conversations/${conversationId}?user_id=${session.user.id}`,
        { method: 'DELETE' }
      );

      if (!res.ok) throw new Error('Delete failed');
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      setConversations(backup);
      toast.error('Failed to delete conversation', {
        description: 'Please try again',
        action: {
          label: 'Retry',
          onClick: () => handleDeleteConversation(conversationId)
        }
      });
    }
  };

  const handlePinConversation = async (conversationId: string, isPinned: boolean): Promise<void> => {
    if (!session?.user?.id) return;

    // Optimistic update with sorting
    setConversations(prev => {
      const updated = prev.map(c =>
        c.id === conversationId ? { ...c, is_pinned: isPinned } : c
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
        `${API_BASE}/conversations/${conversationId}?user_id=${session.user.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_pinned: isPinned })
        }
      );

      if (!res.ok) throw new Error('Failed to update pin status');
    } catch (err) {
      console.error('Pin failed:', err);
      fetchConversations();
    }
  };

  const handleRenameConversation = async (conversationId: string, newTitle: string): Promise<void> => {
    if (!session?.user?.id) return;

    // Optimistic update
    setConversations(prev =>
      prev.map(c =>
        c.id === conversationId ? { ...c, title: newTitle } : c
      )
    );

    try {
      const res = await fetch(
        `${API_BASE}/conversations/${conversationId}?user_id=${session.user.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle })
        }
      );

      if (!res.ok) throw new Error('Failed to rename conversation');
    } catch (err) {
      console.error('Rename failed:', err);
      fetchConversations();
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  // Loading screen
  if (!isDev && isInitializing) {
    return <LoadingScreen />;
  }

  // Login screen
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

  // Main app
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
            isDJSpeaking={isDJSpeaking}
            appleTrack={appleTrack}
            isApplePlaying={isApplePlaying}
            isAppleMusicAuthorized={isAppleMusicAuthorized}
            toggleApple={toggleApple}
            playbackTime={playbackTime}
            seekTo={seekTo}
            executeAgentActions={executeAgentActions}
            fetchConversations={fetchConversations}
            onLogout={() => supabase.auth.signOut()}
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
            isDJSpeaking={isDJSpeaking}
            appleTrack={appleTrack}
            isApplePlaying={isApplePlaying}
            isAppleMusicAuthorized={isAppleMusicAuthorized}
            toggleApple={toggleApple}
            playbackTime={playbackTime}
            seekTo={seekTo}
            appleQueue={appleQueue}
            playAppleTrack={wrappedPlayAppleTrack}
            executeAgentActions={executeAgentActions}
            fetchConversations={fetchConversations}
            onLogout={() => supabase.auth.signOut()}
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
