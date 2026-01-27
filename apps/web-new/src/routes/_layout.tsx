
import { createFileRoute, Outlet, useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { PlaylistSidebar } from '../components/PlaylistSidebar';
import { LoginScreen } from '../components/LoginScreen';
import { AppleMusicLinkOverlay } from '../components/AppleMusicLinkOverlay';
import useAppleMusic from '../hooks/useAppleMusic';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../utils/supabase';

export const Route = createFileRoute('/_layout')({
  component: LayoutComponent,
})

function LayoutComponent() {
  const navigate = useNavigate();
  const location = useLocation();
  // We can't easily get params here for child routes in a generic way without matching
  // But we can parse pathname for activeSessionId like in the original App.jsx
  const pathParts = location.pathname.split('/');
  const activeSessionId = (pathParts[2] === 'chat' && pathParts[3]) ? pathParts[3] : null; // /_layout/chat/$id ? No, URL is /chat/$id

  // Wait, the URL structure will be /chat/$id.
  // pathParts: ['', 'chat', '123']
  const derivedSessionId = (pathParts[1] === 'chat' && pathParts[2]) ? pathParts[2] : null;

  const { session, isLoading: isAuthLoading } = useAuthStore();

  // Local state for layout
  const [conversations, setConversations] = useState<any[]>([]);
  const [isPlaylistCollapsed, setPlaylistCollapsed] = useState(false);
  const [isDJSpeaking, setIsDJSpeaking] = useState(false);

  // Apple Music Binding State
  const [isAppleLinked, setIsAppleLinked] = useState(false);
  const [checkingLink, setCheckingLink] = useState(false);
  const [showAppleLinkOverlay, setShowAppleLinkOverlay] = useState(false);

  // Apple Music Hook
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
  } = useAppleMusic(session?.user?.id ?? null, derivedSessionId);

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
  }, [session?.user?.id]);

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
  }, [session, isAppleLinked, checkingLink]);

  const dismissAppleLinkOverlay = () => {
    setShowAppleLinkOverlay(false)
    sessionStorage.setItem('apple_link_dismissed', 'true')
  }

  const handleDeleteConversation = async (conversationId: string) => {
    if (!session?.user?.id) return;

    // Check if we're deleting the current active conversation
    const isActiveConversation = location.pathname === `/chat/${conversationId}`;
    const backup = [...conversations];

    // Optimistic update
    setConversations(prev => prev.filter(c => c.id !== conversationId));

    // If deleting current conversation, navigate home immediately
    if (isActiveConversation) {
      navigate({ to: '/' });
    }

    try {
      const res = await fetch(`http://localhost:8000/conversations/${conversationId}?user_id=${session.user.id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        throw new Error('Delete failed');
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      setConversations(backup);
      alert('Failed to delete conversation. Please try again.');
    }
  };

  const handlePinConversation = async (conversationId: string, isPinned: boolean) => {
    if (!session?.user?.id) return;

    setConversations(prev => {
        const updated = prev.map(c =>
            c.id === conversationId ? { ...c, is_pinned: isPinned } : c
        );
        return updated.sort((a, b) => {
            if (a.is_pinned === b.is_pinned) {
                return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
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

  if (isAuthLoading || isInitializing || (session && checkingLink)) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full overflow-hidden grayscale animate-pulse">
          <img src="/logo.jpg" alt="Loading" className="w-full h-full object-cover" />
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <>
      {showAppleLinkOverlay && (
        <AppleMusicLinkOverlay
            onDismiss={dismissAppleLinkOverlay}
            onLinkSuccess={() => {
                setIsAppleLinked(true);
                setShowAppleLinkOverlay(false);
            }}
        />
      )}

      <AppLayout
        onNewChat={() => navigate({ to: '/' })}
        onSelectConversation={(id) => navigate({ to: `/chat/${id}` })}
        onDeleteConversation={handleDeleteConversation}
        onPinConversation={handlePinConversation}
        conversations={conversations}
        activeConversationId={derivedSessionId}
        rightPanel={
          <PlaylistSidebar
            currentTrack={appleTrack}
            isPlaying={isApplePlaying}
            queue={appleQueue}
            onPlayTrack={playAppleTrack}
            collapsed={isPlaylistCollapsed}
            toggleCollapse={() => setPlaylistCollapsed(!isPlaylistCollapsed)}
            showQueue={true}
          />
        }
      >
        <Outlet context={{
            session,
            isDJSpeaking,
            appleTrack,
            isApplePlaying,
            toggleApple,
            playbackTime,
            seekTo,
            appleQueue,
            playAppleTrack,
            syncToBackend,
            executeAgentActions,
            fetchConversations,
            setIsDJSpeaking
        }} />
      </AppLayout>
    </>
  );
}
