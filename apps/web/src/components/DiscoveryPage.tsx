/**
 * DiscoveryPage — cold-start landing.
 *
 * Empty-state for the home route: chat-style layout (ChatInput sticky
 * at the bottom, suggestions in the body). Not a Spotify-style browse
 * page — the mental model is "I'm about to chat to start a topic".
 */
import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ChatInput } from './chat/ChatInput';
import { API_BASE } from '../config/api';
import type { Conversation } from '../types';

interface DiscoveryPageProps {
  conversations: Conversation[];
  userId: string | null;
  onSessionCreated?: () => void;
}

interface MoodChip {
  key: string;
  label: string;
  prompt: string;
}

const MOOD_CHIPS: MoodChip[] = [
  { key: 'focus',       label: '专注',   prompt: '给我一些适合专注工作的歌' },
  { key: 'sad',         label: '伤心',   prompt: '想听点伤感的歌' },
  { key: 'high_energy', label: '高能',   prompt: '放点高能炸场的' },
  { key: 'chill',       label: '放空',   prompt: '想听点放松发呆的' },
  { key: 'surprise',    label: '惊喜我', prompt: '随便推荐点我可能没听过的好歌' },
  { key: 'workout',     label: '健身',   prompt: '健身时听的歌' },
  { key: 'sleep',       label: '助眠',   prompt: '帮我入睡的歌' },
];

function formatArtwork(url: string | null | undefined, size = 80): string | null {
  if (!url) return null;
  return url.replace('{w}', String(size)).replace('{h}', String(size));
}

function displayTitle(c: Conversation): string {
  if (c.title) return c.title;
  if (c.last_message_preview) return c.last_message_preview;
  return '新话题';
}

export function DiscoveryPage({ conversations, userId, onSessionCreated }: DiscoveryPageProps) {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const startNewTopic = useCallback(
    async (initialMessage?: string) => {
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
        onSessionCreated?.();
        navigate(`/chat/${session_id}`, {
          replace: true,
          state: initialMessage
            ? { isNewlyCreated: true, initialMessage }
            : { isNewlyCreated: true },
        });
      } catch (e) {
        console.error('[DiscoveryPage] new topic failed:', e);
        toast.error('Failed to start', { description: String(e).slice(0, 200) });
      } finally {
        setIsCreating(false);
      }
    },
    [userId, isCreating, navigate, onSessionCreated],
  );

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    startNewTopic(trimmed);
  }, [input, startNewTopic]);

  const recent = useMemo(() => conversations.slice(0, 8), [conversations]);

  return (
    <div className="flex flex-col h-full">
      {/* Body — suggestions, scrollable if it ever overflows */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 pt-16 pb-6">
          <h1 className="text-ink text-[28px] font-display font-medium tracking-tight text-center mb-2">
            听点啥？
          </h1>
          <p className="text-ink-3 text-[14px] text-center mb-10">
            说一句你想听的，或者从下面选个开始。
          </p>

          {/* Mood chips */}
          <div className="flex flex-wrap justify-center gap-1.5 mb-12">
            {MOOD_CHIPS.map((chip) => (
              <button
                key={chip.key}
                onClick={() => startNewTopic(chip.prompt)}
                disabled={isCreating}
                className="px-3.5 py-1.5 rounded-full bg-chip hairline text-[13px] text-ink-2 hover:text-ink hover:bg-chip-2 transition-colors disabled:opacity-50"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Recent — compact text-led list, not album tiles */}
          {recent.length > 0 && (
            <section>
              <h2 className="text-ink-3 text-[11px] font-medium uppercase tracking-[0.18em] mb-2 px-1">
                Recent
              </h2>
              <div className="flex flex-col">
                {recent.map((c) => {
                  const cover = formatArtwork(c.playlist_cover, 80);
                  const title = displayTitle(c);
                  return (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/chat/${c.id}`)}
                      className="group flex items-center gap-3 px-1.5 py-2 rounded-xl text-left hover:bg-chip transition-colors"
                    >
                      <div className="w-9 h-9 rounded-card overflow-hidden bg-chip-2 shrink-0">
                        {cover ? (
                          <img src={cover} alt={title} className="w-full h-full object-cover" loading="lazy" draggable={false} />
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-ink text-[14px] truncate leading-tight">{title}</div>
                        {(c.playlist_count ?? 0) > 0 && (
                          <div className="text-ink-4 text-[11px] mt-0.5">{c.playlist_count} 首</div>
                        )}
                      </div>
                      <svg className="w-4 h-4 text-ink-4 group-hover:text-ink-3 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* ChatInput at the bottom — same place users expect it in /chat/{id} */}
      <div className="shrink-0 px-4 pb-6 pt-2">
        <ChatInput
          input={input}
          isLoading={isCreating}
          isDJSpeaking={false}
          isPlaying={false}
          onInputChange={setInput}
          onSend={handleSend}
        />
      </div>
    </div>
  );
}
