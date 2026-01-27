/**
 * Main application component
 * @module App
 */

import { useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { HomeRoute, ChatRoute } from './routes';
import useAppleMusic from './hooks/useAppleMusic';
import { useDevTools } from './utils/devTools';
import { supabase } from './utils/supabase';
import type { SupabaseSession, Conversation } from './types';

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

/**
 * Apple Music link overlay
 */
function AppleMusicLinkOverlay({
  onLink,
  onDismiss
}: {
  onLink: () => Promise<void>;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 relative">
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center space-y-6">
          {/* Apple Music Icon */}
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-pink-500 to-red-500 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" viewBox="0 0 39 44" fill="currentColor">
              <path d="M19.8196726,13.1384615 C20.902953,13.1384615 22.2608678,12.406103 23.0695137,11.4296249 C23.8018722,10.5446917 24.3358837,9.30883662 24.3358837,8.07298156 C24.3358837,7.9051494 24.3206262,7.73731723 24.2901113,7.6 C23.0847711,7.64577241 21.6353115,8.4086459 20.7656357,9.43089638 C20.0790496,10.2090273 19.4534933,11.4296249 19.4534933,12.6807374 C19.4534933,12.8638271 19.4840083,13.0469167 19.4992657,13.1079466 C19.5755531,13.1232041 19.6976128,13.1384615 19.8196726,13.1384615 Z M16.0053051,31.6 C17.4852797,31.6 18.1413509,30.6082645 19.9875048,30.6082645 C21.8641736,30.6082645 22.2761252,31.5694851 23.923932,31.5694851 C25.5412238,31.5694851 26.6245041,30.074253 27.6467546,28.6095359 C28.7910648,26.9312142 29.2640464,25.2834075 29.2945613,25.2071202 C29.1877591,25.1766052 26.0904927,23.9102352 26.0904927,20.3552448 C26.0904927,17.2732359 28.5316879,15.8848061 28.6690051,15.7780038 C27.0517133,13.4588684 24.5952606,13.3978385 23.923932,13.3978385 C22.1082931,13.3978385 20.6283185,14.4963764 19.6976128,14.4963764 C18.6906198,14.4963764 17.36322,13.4588684 15.7917006,13.4588684 C12.8012365,13.4588684 9.765,15.9305785 9.765,20.5993643 C9.765,23.4982835 10.8940528,26.565035 12.2824825,28.548506 C13.4725652,30.2268277 14.5100731,31.6 16.0053051,31.6 Z" fillRule="nonzero"/>
            </svg>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900">Connect Apple Music</h2>
            <p className="text-gray-500 text-sm">
              Link your Apple Music account to enable music playback and personalized recommendations.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={async () => {
                await onLink();
                if ((window as any).MusicKit?.getInstance()?.isAuthorized) {
                  onDismiss();
                }
              }}
              className="w-full h-12 rounded-xl bg-black text-white font-medium text-sm hover:bg-gray-800 transition-colors flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 39 44" fill="currentColor">
                <path d="M19.8196726,13.1384615 C20.902953,13.1384615 22.2608678,12.406103 23.0695137,11.4296249 C23.8018722,10.5446917 24.3358837,9.30883662 24.3358837,8.07298156 C24.3358837,7.9051494 24.3206262,7.73731723 24.2901113,7.6 C23.0847711,7.64577241 21.6353115,8.4086459 20.7656357,9.43089638 C20.0790496,10.2090273 19.4534933,11.4296249 19.4534933,12.6807374 C19.4534933,12.8638271 19.4840083,13.0469167 19.4992657,13.1079466 C19.5755531,13.1232041 19.6976128,13.1384615 19.8196726,13.1384615 Z M16.0053051,31.6 C17.4852797,31.6 18.1413509,30.6082645 19.9875048,30.6082645 C21.8641736,30.6082645 22.2761252,31.5694851 23.923932,31.5694851 C25.5412238,31.5694851 26.6245041,30.074253 27.6467546,28.6095359 C28.7910648,26.9312142 29.2640464,25.2834075 29.2945613,25.2071202 C29.1877591,25.1766052 26.0904927,23.9102352 26.0904927,20.3552448 C26.0904927,17.2732359 28.5316879,15.8848061 28.6690051,15.7780038 C27.0517133,13.4588684 24.5952606,13.3978385 23.923932,13.3978385 C22.1082931,13.3978385 20.6283185,14.4963764 19.6976128,14.4963764 C18.6906198,14.4963764 17.36322,13.4588684 15.7917006,13.4588684 C12.8012365,13.4588684 9.765,15.9305785 9.765,20.5993643 C9.765,23.4982835 10.8940528,26.565035 12.2824825,28.548506 C13.4725652,30.2268277 14.5100731,31.6 16.0053051,31.6 Z" fillRule="nonzero"/>
              </svg>
              Connect Apple Music
            </button>

            <button
              onClick={onDismiss}
              className="w-full h-10 text-gray-500 text-sm hover:text-gray-700 transition-colors"
            >
              Maybe Later
            </button>
          </div>

          <p className="text-xs text-gray-400 leading-relaxed">
            You can always connect later from settings.
          </p>
        </div>
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

  // Data state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isDJSpeaking] = useState<boolean>(false);

  // Apple Music state
  const [isAppleLinked, setIsAppleLinked] = useState<boolean>(false);
  const [checkingLink, setCheckingLink] = useState<boolean>(false);
  const [showAppleLinkOverlay, setShowAppleLinkOverlay] = useState<boolean>(false);

  // Extract active session ID from URL
  const pathParts = location.pathname.split('/');
  const activeSessionId = (pathParts[1] === 'chat' && pathParts[2]) ? pathParts[2] : null;

  // Apple Music hook
  const {
    login: loginApple,
    currentTrack: appleTrack,
    isPlaying: isApplePlaying,
    togglePlay: toggleApple,
    queue: appleQueue,
    playTrack: playAppleTrack,
    isInitializing,
    playbackTime,
    seekTo,
    executeAgentActions
  } = useAppleMusic({
    userId: session?.user.id || null,
    activeSessionId
  });

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

  // Check Apple Music link status when session changes
  useEffect(() => {
    if (!session?.user.id) {
      setIsAppleLinked(false);
      setCheckingLink(false);
      return;
    }

    setCheckingLink(true);
    supabase
      .from('profiles')
      .select('apple_music_token')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setIsAppleLinked(!!data?.apple_music_token);
        setCheckingLink(false);
      });
  }, [session?.user.id]);

  // Show Apple Music link overlay if needed
  useEffect(() => {
    const dismissed = sessionStorage.getItem('apple_link_dismissed');
    if (session && !isAppleLinked && !checkingLink && !dismissed) {
      setShowAppleLinkOverlay(true);
    } else if (isAppleLinked) {
      setShowAppleLinkOverlay(false);
    }
  }, [session, isAppleLinked, checkingLink]);

  // ============================================================================
  // Data Fetching
  // ============================================================================

  const fetchConversations = async (): Promise<void> => {
    if (!session?.user.id) return;

    try {
      const res = await fetch(`http://localhost:8000/conversations?user_id=${session.user.id}`);
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

  const handleLinkApple = async (): Promise<void> => {
    await loginApple();

    const mk = (window as any).MusicKit?.getInstance();
    if (mk?.isAuthorized && session?.user.id) {
      const token = mk.musicUserToken;
      if (token) {
        const { error } = await supabase
          .from('profiles')
          .update({ apple_music_token: token })
          .eq('id', session.user.id);

        if (!error) {
          setIsAppleLinked(true);
        } else {
          console.error('Link Error:', error);
          alert('Failed to save Apple Music link. Please try again.');
        }
      }
    }
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
        `http://localhost:8000/conversations/${conversationId}?user_id=${session.user.id}`,
        { method: 'DELETE' }
      );

      if (!res.ok) throw new Error('Delete failed');
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      setConversations(backup);
      alert('Failed to delete conversation. Please try again.');
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
        `http://localhost:8000/conversations/${conversationId}?user_id=${session.user.id}`,
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
        `http://localhost:8000/conversations/${conversationId}?user_id=${session.user.id}`,
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

  const dismissAppleLinkOverlay = (): void => {
    setShowAppleLinkOverlay(false);
    sessionStorage.setItem('apple_link_dismissed', 'true');
  };

  // ============================================================================
  // Render
  // ============================================================================

  const isLoggedIn = !!session;

  // Loading screen
  if (isInitializing || (isLoggedIn && checkingLink)) {
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
      {showAppleLinkOverlay && (
        <AppleMusicLinkOverlay onLink={handleLinkApple} onDismiss={dismissAppleLinkOverlay} />
      )}

      <Routes>
        <Route path="/" element={
          <HomeRoute
            session={session}
            conversations={conversations}
            onDeleteConversation={handleDeleteConversation}
            onPinConversation={handlePinConversation}
            onRenameConversation={handleRenameConversation}
            isDJSpeaking={isDJSpeaking}
            appleTrack={appleTrack}
            isApplePlaying={isApplePlaying}
            toggleApple={toggleApple}
            playbackTime={playbackTime}
            seekTo={seekTo}
            executeAgentActions={executeAgentActions}
            fetchConversations={fetchConversations}
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
            toggleApple={toggleApple}
            playbackTime={playbackTime}
            seekTo={seekTo}
            appleQueue={appleQueue}
            playAppleTrack={playAppleTrack}
            executeAgentActions={executeAgentActions}
            fetchConversations={fetchConversations}
          />
        } />
      </Routes>
    </>
  );
}

export default App;
