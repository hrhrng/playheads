import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { ChatInterface } from './components/ChatInterface'
import { NewChatView } from './components/NewChatView'
import useAppleMusic from './hooks/useAppleMusic'
import { PlaylistSidebar } from './components/PlaylistSidebar'
import { supabase } from './utils/supabase'

function App() {
  // Supabase Auth State
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  // Conversation state
  const [conversations, setConversations] = useState([])
  const [isPlaylistCollapsed, setPlaylistCollapsed] = useState(false)
  const [isDJSpeaking, setIsDJSpeaking] = useState(false)

  // Apple Music Binding State
  const [isAppleLinked, setIsAppleLinked] = useState(false)
  const [checkingLink, setCheckingLink] = useState(false)
  const [showAppleLinkOverlay, setShowAppleLinkOverlay] = useState(false)

  // Track active conversation ID from URL
  const location = useLocation()
  const [activeSessionId, setActiveSessionId] = useState(null)

  // Update active session ID when route changes
  useEffect(() => {
    const pathParts = location.pathname.split('/')
    if (pathParts[1] === 'chat' && pathParts[2]) {
      setActiveSessionId(pathParts[2])
    } else {
      setActiveSessionId(null)
    }
  }, [location.pathname])

  const {
    isAuthorized: isAppleAuthorized,
    login: loginApple,
    currentTrack: appleTrack,
    isPlaying: isApplePlaying,
    togglePlay: toggleApple,
    queue: appleQueue,
    search: searchApple,
    setQueue: setAppleQueue,
    playTrack: playAppleTrack,
    isInitializing,
    playbackTime,
    seekTo,
    syncToBackend,
    executeAgentActions
  } = useAppleMusic(session?.user?.id, activeSessionId);

  // Fetch conversations
  const fetchConversations = async () => {
    if (!session?.user?.id) return;

    try {
      const res = await fetch(`http://localhost:8000/conversations?user_id=${session.user.id}`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (e) {
      console.error('Failed to fetch conversations:', e);
    }
  };

  // Fetch conversations when user logs in
  useEffect(() => {
    if (session?.user?.id) {
      fetchConversations();
    }
  }, [session?.user?.id]);

  useEffect(() => {
    // Check active sessions and subscribe to auth changes
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Check if linked when session exists
  useEffect(() => {
    if (session?.user?.id) {
      setCheckingLink(true)
      supabase
        .from('profiles')
        .select('apple_music_token')
        .eq('id', session.user.id)
        .single()
        .then(({ data, error }) => {
          if (data && data.apple_music_token) {
            setIsAppleLinked(true)
          } else {
            setIsAppleLinked(false)
          }
          setCheckingLink(false)
        })
    } else {
      setIsAppleLinked(false)
      setCheckingLink(false)
    }
  }, [session])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin
      }
    })

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: 'Check your email for the login link!' })
    }
    setLoading(false)
  }

  const handleLinkApple = async () => {
    await loginApple();

    const mk = window.MusicKit?.getInstance();

    if (mk?.isAuthorized && session?.user?.id) {
      const token = mk.musicUserToken;
      if (token) {
        const { error } = await supabase
          .from('profiles')
          .update({ apple_music_token: token })
          .eq('id', session.user.id);

        if (!error) {
          setIsAppleLinked(true);
        } else {
          console.error('Link Error:', error)
          alert('Failed to save Apple Music link. Please try again.');
        }
      }
    }
  }

  const handleDeleteConversation = async (conversationId) => {
    if (!session?.user?.id) return;

    const backup = [...conversations];

    // Optimistic update
    setConversations(prev => prev.filter(c => c.id !== conversationId));

    try {
      const res = await fetch(`http://localhost:8000/conversations/${conversationId}?user_id=${session.user.id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        throw new Error('Delete failed');
      }

      console.log("Successfully deleted conversation:", conversationId);
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      setConversations(backup);
      alert('Failed to delete conversation. Please try again.');
    }
  };

  const handlePinConversation = async (conversationId, isPinned) => {
    if (!session?.user?.id) return;

    setConversations(prev => {
        const updated = prev.map(c =>
            c.id === conversationId ? { ...c, is_pinned: isPinned } : c
        );
        return updated.sort((a, b) => {
            if (a.is_pinned === b.is_pinned) {
                return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
            }
            return a.is_pinned ? -1 : 1;
        });
    });

    try {
        const res = await fetch(`http://localhost:8000/conversations/${conversationId}?user_id=${session.user.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_pinned: isPinned })
        });

        if (!res.ok) throw new Error('Failed to update pin status');
    } catch (err) {
        console.error('Pin failed:', err);
        fetchConversations();
    }
  };

  // Show Apple Music link overlay
  useEffect(() => {
    if (session && !isAppleLinked && !checkingLink) {
      const dismissed = sessionStorage.getItem('apple_link_dismissed')
      if (!dismissed) {
        setShowAppleLinkOverlay(true)
      }
    } else if (isAppleLinked) {
      setShowAppleLinkOverlay(false)
    }
  }, [session, isAppleLinked, checkingLink])

  const dismissAppleLinkOverlay = () => {
    setShowAppleLinkOverlay(false)
    sessionStorage.setItem('apple_link_dismissed', 'true')
  }

  const isLoggedIn = !!session;

  // Loading state
  if (isInitializing || (isLoggedIn && checkingLink)) {
    return (
      <div className="min-h-screen w-full bg-air-50 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full overflow-hidden grayscale animate-pulse">
          <img src="/logo.jpg" alt="Loading" className="w-full h-full object-cover" />
        </div>
      </div>
    );
  }

  // Login Screen
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen w-full bg-air-50 flex flex-col items-center justify-center p-6 relative">
        <div className="flex flex-col items-center space-y-12 max-w-sm w-full animate-fade-in">
          <div className="w-40 h-40 rounded-full overflow-hidden grayscale hover:grayscale-0 transition-all duration-700">
            <img src="/logo.jpg" alt="Playhead" className="w-full h-full object-cover scale-105" />
          </div>

          <div className="text-center space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight text-air-900 font-sans">Playhead</h1>
            <div className="h-px w-12 bg-air-200 mx-auto" />
            <p className="text-xs font-mono text-air-400 uppercase tracking-widest">Sonic Intelligence</p>
          </div>

          <form onSubmit={handleLogin} className="w-full space-y-4 pt-4">
            {message && (
              <div className={`p-3 text-sm rounded-md text-center ${message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
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

  // Apple Music Link Overlay Component
  const AppleMusicLinkOverlay = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 relative">
        <button
          onClick={dismissAppleLinkOverlay}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-pink-500 to-red-500 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" viewBox="0 0 39 44" fill="currentColor">
              <path d="M19.8196726,13.1384615 C20.902953,13.1384615 22.2608678,12.406103 23.0695137,11.4296249 C23.8018722,10.5446917 24.3358837,9.30883662 24.3358837,8.07298156 C24.3358837,7.9051494 24.3206262,7.73731723 24.2901113,7.6 C23.0847711,7.64577241 21.6353115,8.4086459 20.7656357,9.43089638 C20.0790496,10.2090273 19.4534933,11.4296249 19.4534933,12.6807374 C19.4534933,12.8638271 19.4840083,13.0469167 19.4992657,13.1079466 C19.5755531,13.1232041 19.6976128,13.1384615 19.8196726,13.1384615 Z M16.0053051,31.6 C17.4852797,31.6 18.1413509,30.6082645 19.9875048,30.6082645 C21.8641736,30.6082645 22.2761252,31.5694851 23.923932,31.5694851 C25.5412238,31.5694851 26.6245041,30.074253 27.6467546,28.6095359 C28.7910648,26.9312142 29.2640464,25.2834075 29.2945613,25.2071202 C29.1877591,25.1766052 26.0904927,23.9102352 26.0904927,20.3552448 C26.0904927,17.2732359 28.5316879,15.8848061 28.6690051,15.7780038 C27.0517133,13.4588684 24.5952606,13.3978385 23.923932,13.3978385 C22.1082931,13.3978385 20.6283185,14.4963764 19.6976128,14.4963764 C18.6906198,14.4963764 17.36322,13.4588684 15.7917006,13.4588684 C12.8012365,13.4588684 9.765,15.9305785 9.765,20.5993643 C9.765,23.4982835 10.8940528,26.565035 12.2824825,28.548506 C13.4725652,30.2268277 14.5100731,31.6 16.0053051,31.6 Z" fillRule="nonzero"/>
            </svg>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900">Connect Apple Music</h2>
            <p className="text-gray-500 text-sm">Link your Apple Music account to enable music playback and personalized recommendations.</p>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={async () => {
                await handleLinkApple();
                if (window.MusicKit?.getInstance()?.isAuthorized) {
                  setShowAppleLinkOverlay(false);
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
              onClick={dismissAppleLinkOverlay}
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

  // Main app with routes
  return (
    <>
      {showAppleLinkOverlay && <AppleMusicLinkOverlay />}

      <Routes>
        {/* New conversation route - this is the home page */}
        <Route path="/" element={
          <NewChatRoute
            session={session}
            conversations={conversations}
            onDeleteConversation={handleDeleteConversation}
            onPinConversation={handlePinConversation}
            isDJSpeaking={isDJSpeaking}
            appleTrack={appleTrack}
            isApplePlaying={isApplePlaying}
            toggleApple={toggleApple}
            playbackTime={playbackTime}
            seekTo={seekTo}
            syncToBackend={syncToBackend}
            executeAgentActions={executeAgentActions}
            fetchConversations={fetchConversations}
          />
        } />

        {/* Existing conversation route */}
        <Route path="/chat/:id" element={
          <ChatRoute
            session={session}
            conversations={conversations}
            onDeleteConversation={handleDeleteConversation}
            onPinConversation={handlePinConversation}
            isDJSpeaking={isDJSpeaking}
            appleTrack={appleTrack}
            isApplePlaying={isApplePlaying}
            toggleApple={toggleApple}
            playbackTime={playbackTime}
            seekTo={seekTo}
            appleQueue={appleQueue}
            playAppleTrack={playAppleTrack}
            isPlaylistCollapsed={isPlaylistCollapsed}
            setPlaylistCollapsed={setPlaylistCollapsed}
            syncToBackend={syncToBackend}
            executeAgentActions={executeAgentActions}
            fetchConversations={fetchConversations}
          />
        } />
      </Routes>
    </>
  );
}

// New Chat Route Component
function NewChatRoute({ session, conversations, onDeleteConversation, onPinConversation, isDJSpeaking, appleTrack, isApplePlaying, toggleApple, playbackTime, seekTo, syncToBackend, executeAgentActions, fetchConversations }) {
  const navigate = useNavigate();

  const handleSessionCreated = (newSessionId, preservedMessages, initialMessage) => {
    console.log("Session created from home, navigating to:", newSessionId, "with initial message:", initialMessage);
    // Navigate immediately with preserved messages and initial message in state
    navigate(`/chat/${newSessionId}`, {
      replace: true,
      state: {
        isNewlyCreated: true,
        preservedMessages: preservedMessages, // Pass current messages to new component
        initialMessage: initialMessage // Pass the message to auto-send
      }
    });
    // Refresh conversation list
    fetchConversations();
  };

  return (
    <AppLayout
      onNewChat={() => navigate('/')}
      onSelectConversation={(id) => navigate(`/chat/${id}`)}
      onDeleteConversation={onDeleteConversation}
      onPinConversation={onPinConversation}
      conversations={conversations}
      activeConversationId={null}
      rightPanel={null}
    >
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
          userId={session?.user?.id}
          onEmptyChange={() => {}}
          onMessageSent={fetchConversations}
          onSessionCreated={handleSessionCreated}
          isNewChat={true}
        />
      </div>
    </AppLayout>
  );
}

// Chat Route Component
function ChatRoute({ session, conversations, onDeleteConversation, onPinConversation, isDJSpeaking, appleTrack, isApplePlaying, toggleApple, playbackTime, seekTo, appleQueue, playAppleTrack, isPlaylistCollapsed, setPlaylistCollapsed, syncToBackend, executeAgentActions, fetchConversations }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isChatEmpty, setIsChatEmpty] = useState(false);

  const handleSessionCreated = (newSessionId, preservedMessages, initialMessage) => {
    console.log("Session created in existing chat, navigating to:", newSessionId, "with messages:", preservedMessages?.length, "initial message:", initialMessage);
    // Navigate to the new conversation with preserved messages and initial message
    navigate(`/chat/${newSessionId}`, {
      replace: true,
      state: {
        isNewlyCreated: true,
        preservedMessages: preservedMessages,
        initialMessage: initialMessage
      }
    });
    // Refresh conversation list
    fetchConversations();
  };

  return (
    <AppLayout
      onNewChat={() => navigate('/')}
      onSelectConversation={(convId) => navigate(`/chat/${convId}`)}
      onDeleteConversation={onDeleteConversation}
      onPinConversation={onPinConversation}
      conversations={conversations}
      activeConversationId={id}
      rightPanel={
        !isChatEmpty ? (
          <PlaylistSidebar
            currentTrack={appleTrack}
            isPlaying={isApplePlaying}
            queue={appleQueue}
            onPlayTrack={playAppleTrack}
            collapsed={isPlaylistCollapsed}
            toggleCollapse={() => setPlaylistCollapsed(!isPlaylistCollapsed)}
            showQueue={true}
          />
        ) : null
      }
    >
      <div className="h-full w-full flex flex-col relative z-10">
        <ChatInterface
          isDJSpeaking={isDJSpeaking}
          currentTrack={appleTrack}
          isPlaying={isApplePlaying}
          togglePlay={toggleApple}
          playbackTime={playbackTime}
          onSeek={seekTo}
          sessionId={id === 'pending' ? null : id}
          onAgentActions={executeAgentActions}
          syncToBackend={(data) => syncToBackend(data, id === 'pending' ? null : id)}
          userId={session?.user?.id}
          onEmptyChange={setIsChatEmpty}
          onMessageSent={fetchConversations}
          onSessionCreated={handleSessionCreated}
          isNewChat={id === 'pending'}
        />
      </div>
    </AppLayout>
  );
}

export default App
