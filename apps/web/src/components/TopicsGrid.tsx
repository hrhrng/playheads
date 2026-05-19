/**
 * TopicsGrid — cold-start landing.
 *
 * A "topic" is a (chat + playlist) bundle stored as a conversation. The
 * grid shows each topic as a card (cover + title); tapping a card opens
 * the chat and restores its saved playlist. A "+ new topic" card creates
 * a fresh session and navigates straight in.
 */
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useState } from 'react';
import { API_BASE } from '../config/api';
import type { Conversation } from '../types';

interface TopicsGridProps {
  conversations: Conversation[];
  userId: string | null;
  onSessionCreated?: (newSessionId: string) => void;
}

function formatArtwork(url: string | null | undefined, size = 600): string | null {
  if (!url) return null;
  return url.replace('{w}', String(size)).replace('{h}', String(size));
}

function displayTitle(c: Conversation): string {
  if (c.title) return c.title;
  if (c.last_message_preview) return c.last_message_preview;
  return 'Untitled topic';
}

export function TopicsGrid({ conversations, userId, onSessionCreated }: TopicsGridProps) {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);

  const handleNew = async () => {
    if (!userId || isCreating) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${API_BASE}/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) throw new Error(`session/create ${res.status}`);
      const { session_id } = (await res.json()) as { session_id: string };
      onSessionCreated?.(session_id);
      navigate(`/chat/${session_id}`, { replace: true });
    } catch (e) {
      console.error('[TopicsGrid] new session failed:', e);
      toast.error('Failed to start a new topic', { description: String(e).slice(0, 200) });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto px-6 py-8">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-ink text-2xl font-display font-medium tracking-tight mb-1">
          Your topics
        </h2>
        <p className="text-ink-3 text-sm mb-6">
          每段聊天 + 它的歌单。点开续上次，新开一个从零开始。
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {/* New topic card */}
          <button
            onClick={handleNew}
            disabled={isCreating || !userId}
            className="group aspect-square rounded-card glass hairline flex flex-col items-center justify-center gap-2 hover:bg-ink/10 transition-all disabled:opacity-50"
          >
            {isCreating ? (
              <svg className="w-7 h-7 text-ink-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-9 h-9 text-ink-2 group-hover:text-ink transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            )}
            <span className="text-[13px] text-ink-2 group-hover:text-ink font-medium">New topic</span>
          </button>

          {conversations.map((c) => {
            const cover = formatArtwork(c.playlist_cover, 600);
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/chat/${c.id}`)}
                className="group aspect-square rounded-card overflow-hidden bg-chip hairline relative text-left transition-transform hover:-translate-y-0.5"
              >
                {cover ? (
                  <img
                    src={cover}
                    alt={displayTitle(c)}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                    draggable={false}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-chip-2 to-chip" />
                )}
                {/* Gradient overlay for text legibility */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                {/* Track count badge */}
                {(c.playlist_count ?? 0) > 0 && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-md text-[10px] text-white/85 font-medium">
                    {c.playlist_count} 首
                  </div>
                )}
                {/* Title at bottom */}
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <div className="text-white text-[13px] font-display font-medium leading-snug line-clamp-2">
                    {displayTitle(c)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {conversations.length === 0 && (
          <div className="mt-12 text-center text-ink-3 text-sm">
            还没有任何 topic。点「New topic」开一个，聊点想听的，AI 帮你攒一个私人歌单。
          </div>
        )}
      </div>
    </div>
  );
}
