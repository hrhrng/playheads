import { useState, useEffect } from 'react'
import { AppLayout } from './components/AppLayout'
import { ChatInterface } from './components/ChatInterface'
import useAppleMusic from './hooks/useAppleMusic'
import { loginWithSpotify } from './utils/spotifyAuth'
import { PlaylistSidebar } from './components/PlaylistSidebar'
import { supabase } from './utils/supabase'

function App() {
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
    sessionId: appleSessionId, // This might need to sync with Supabase session/conversation ID
    syncToBackend,
    executeAgentActions
  } = useAppleMusic();

  const [spotifyToken] = useState(localStorage.getItem('spotify_access_token'));
  const [isPlaylistCollapsed, setPlaylistCollapsed] = useState(false);
  const [isDJSpeaking, setIsDJSpeaking] = useState(false);

  // Supabase Auth State
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  // Apple Music Binding State
  const [isAppleLinked, setIsAppleLinked] = useState(false)
  const [checkingLink, setCheckingLink] = useState(false)
  const [customSessionId, setCustomSessionId] = useState(null)
  const [isChatEmpty, setIsChatEmpty] = useState(true)
  const [conversations, setConversations] = useState([])

  // Fetch conversations
  const fetchConversations = async () => {
    try {
      const res = await fetch('http://localhost:8000/conversations');
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (e) {
      console.error('Failed to fetch conversations:', e);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

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
          // If token exists, we consider it linked
          // We might also want to verify it's valid, but for binding existence check:
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

    // Magic Link Login
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
    // 1. Authorize via MusicKit
    await loginApple();

    // 2. Get Token and Save to DB
    const mk = window.MusicKit?.getInstance();

    // Note: user might close popup without auth, so checks are needed
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

  const handleNewChat = () => {
    // Generate a UUID v4 compliant string
    const newId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    setCustomSessionId(newId);
    setIsChatEmpty(true);
    console.log("Starting new chat session:", newId);
  };

  const handleSelectConversation = (conversationId) => {
    setCustomSessionId(conversationId);
    setIsChatEmpty(false);
    console.log("Switching to conversation:", conversationId);
  };

  // Auth & Linking Status
  // 1. Not Logged In -> Show Login
  // 2. Logged In, Checking Link -> Show Loading
  // 3. Logged In, Not Linked -> Show Link Screen
  // 4. Logged In, Linked -> Main App

  const isLoggedIn = !!session;


  // Loading state (Global Init or Profile Check)
  if (isInitializing || (isLoggedIn && checkingLink)) {
    return (
      <div className="min-h-screen w-full bg-air-50 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full overflow-hidden grayscale animate-pulse">
          <img src="/logo.jpg" alt="Loading" className="w-full h-full object-cover" />
        </div>
      </div>
    );
  }

  // 1. Login Logic
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen w-full bg-air-50 flex flex-col items-center justify-center p-6 relative">
        <div className="flex flex-col items-center space-y-12 max-w-sm w-full animate-fade-in">
          {/* Logo */}
          <div className="w-40 h-40 rounded-full overflow-hidden grayscale hover:grayscale-0 transition-all duration-700">
            <img src="/logo.jpg" alt="Playhead" className="w-full h-full object-cover scale-105" />
          </div>

          <div className="text-center space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight text-air-900 font-sans">Playhead</h1>
            <div className="h-px w-12 bg-air-200 mx-auto" />
            <p className="text-xs font-mono text-air-400 uppercase tracking-widest">Sonic Intelligence</p>
          </div>

          {/* Email Login Form */}
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

          {/* Separator / Disclaimer */}
          <div className="absolute bottom-8 text-air-300 text-[10px] font-mono">v2.1.0</div>
        </div>
      </div>
    );
  }

  // 3. Link Apple Music Screen
  if (isLoggedIn && !isAppleLinked) {
    return (
      <div className="min-h-screen w-full bg-air-50 flex flex-col items-center justify-center p-6 relative animate-fade-in">
        <div className="max-w-md w-full text-center space-y-8">
          {/* Logo - Smaller */}
          <div className="w-24 h-24 mx-auto rounded-full overflow-hidden grayscale">
            <img src="/logo.jpg" alt="Playhead" className="w-full h-full object-cover" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-air-900">Connect Music Service</h2>
            <p className="text-air-500 text-sm">Link your Apple Music account to enable Playhead's sonic intelligence.</p>
          </div>

          <div className="pt-4 px-8">
            <button
              onClick={handleLinkApple}
              className="w-full h-12 rounded-lg border border-air-200 bg-white text-air-900 font-medium text-sm hover:border-air-900 transition-colors flex items-center justify-center gap-3 shadow-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.05-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.74 1.18 0 2.21-1.21 3.96-1.13.62.03 1.95.16 3.09 1.83-2.83 1.62-2.3 5.4.11 6.5l-.23.63a13.3 13.3 0 0 1-1.92 4.4zM13 5c-1.85-.22-3.15 1.5-3.15 3.3a3.6 3.6 0 0 1 3.5-3.3z" />
              </svg>
              Link Apple Music
            </button>
            <p className="mt-6 text-xs text-air-400 leading-relaxed">
              Binding is permanent for this account.
              <br />Token expires periodically (~6 months) and may require re-login.
            </p>
          </div>
        </div>
      </div>
    );
  }




  // Determine correct session ID for backend
  // Priority: Custom (New Chat) -> User ID -> Apple ID
  const activeSessionId = customSessionId || session?.user?.id || appleSessionId;

  // Main app
  return (
    <AppLayout
      onNewChat={handleNewChat}
      onSelectConversation={handleSelectConversation}
      conversations={conversations}
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
          sessionId={activeSessionId}
          onAgentActions={executeAgentActions}
          syncToBackend={(data) => syncToBackend(data, activeSessionId)}
          userId={session?.user?.id}
          onEmptyChange={setIsChatEmpty}
        />
      </div>
    </AppLayout>
  );
}

export default App
