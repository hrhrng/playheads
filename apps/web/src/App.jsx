import { useState, useEffect } from 'react'
import { AppLayout } from './components/AppLayout'
import { ChatInterface } from './components/ChatInterface'
import useAppleMusic from './hooks/useAppleMusic'
import { loginWithSpotify } from './utils/spotifyAuth'
import { PlaylistSidebar } from './components/PlaylistSidebar'

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
    sessionId,
    syncToBackend,
    executeAgentActions
  } = useAppleMusic();

  const [spotifyToken] = useState(localStorage.getItem('spotify_access_token'));
  const [isPlaylistCollapsed, setPlaylistCollapsed] = useState(false);
  const [isDJSpeaking, setIsDJSpeaking] = useState(false);

  const isLoggedIn = isAppleAuthorized || spotifyToken;

  // Load initial playlist when authorized
  useEffect(() => {
    if (isAppleAuthorized) {
      searchApple('The Beatles').then(tracks => {
        if (tracks.length > 0) {
          setAppleQueue(tracks);
        }
      });
    }
  }, [isAppleAuthorized]);

  // Loading state
  if (isInitializing) {
    return (
      <div className="min-h-screen w-full bg-air-50 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full overflow-hidden grayscale animate-pulse">
          <img src="/logo.jpg" alt="Loading" className="w-full h-full object-cover" />
        </div>
      </div>
    );
  }

  // Login screen
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

          {/* Login Buttons */}
          <div className="w-full space-y-4 pt-8">
            <button
              onClick={loginApple}
              className="w-full h-12 rounded-lg border border-air-200 bg-white text-air-900 font-medium text-sm hover:border-air-900 transition-colors flex items-center justify-center gap-3"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.74 1.18 0 2.21-1.21 3.96-1.13.62.03 1.95.16 3.09 1.83-2.83 1.62-2.3 5.4.11 6.5l-.23.63a13.3 13.3 0 0 1-1.92 4.4zM13 5c-1.85-.22-3.15 1.5-3.15 3.3a3.6 3.6 0 0 1 3.5-3.3z" />
              </svg>
              Connect Apple Music
            </button>

            <button
              onClick={loginWithSpotify}
              className="w-full h-12 rounded-lg bg-black text-white font-medium text-sm transition-colors flex items-center justify-center gap-3"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
              Connect Spotify
            </button>
          </div>
        </div>

        <div className="absolute bottom-8 text-air-300 text-[10px] font-mono">v2.0.0</div>
      </div>
    );
  }

  // Main app
  return (
    <AppLayout
      rightPanel={
        <PlaylistSidebar
          currentTrack={appleTrack}
          isPlaying={isApplePlaying}
          queue={appleQueue}
          onPlayTrack={playAppleTrack}
          collapsed={isPlaylistCollapsed}
          toggleCollapse={() => setPlaylistCollapsed(!isPlaylistCollapsed)}
        />
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
          sessionId={sessionId}
          onAgentActions={executeAgentActions}
          syncToBackend={syncToBackend}
        />
      </div>
    </AppLayout>
  );
}

export default App
