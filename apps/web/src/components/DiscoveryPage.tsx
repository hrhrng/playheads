/**
 * DiscoveryPage — cold-start landing.
 *
 * Discovery page that lets the user start a new topic in multiple ways:
 * typing in the composer, picking a recent topic, or tapping a mood
 * chip. Every affordance ends at the same place: a new or existing
 * /chat/{id} with the appropriate playlist primed.
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

// A handful of warm cover-art-like gradients. Hashed off topic id so
// each topic gets a stable color when no real artwork is available.
const FALLBACK_GRADIENTS = [
  ['#5b4636', '#8a6a4f'],
  ['#3a5a40', '#588157'],
  ['#3d5a80', '#98c1d9'],
  ['#9d4edd', '#5a189a'],
  ['#bb3e03', '#ee9b00'],
  ['#264653', '#2a9d8f'],
  ['#7209b7', '#3a0ca3'],
  ['#bc4749', '#a7c957'],
  ['#003566', '#ffc300'],
  ['#5f0f40', '#9a031e'],
];

function hashIndex(id: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

function formatArtwork(url: string | null | undefined, size = 400): string | null {
  if (!url) return null;
  return url.replace('{w}', String(size)).replace('{h}', String(size));
}

function displayTitle(c: Conversation): string {
  if (c.title) return c.title;
  if (c.last_message_preview) return c.last_message_preview;
  return '新话题';
}

function firstChar(s: string): string {
  return s.trim().charAt(0) || '·';
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

  const recent = useMemo(() => conversations.slice(0, 24), [conversations]);

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 pt-12 pb-16">
        {/* Composer */}
        <div className="mb-4">
          <h1 className="text-ink text-[22px] font-display font-medium tracking-tight">听点啥？</h1>
        </div>
        <div className="mb-5">
          <ChatInput
            input={input}
            isLoading={isCreating}
            isDJSpeaking={false}
            isPlaying={false}
            onInputChange={setInput}
            onSend={handleSend}
          />
        </div>

        {/* Mood chips */}
        <div className="flex flex-wrap gap-1.5 mb-10">
          {MOOD_CHIPS.map((chip) => (
            <button
              key={chip.key}
              onClick={() => startNewTopic(chip.prompt)}
              disabled={isCreating}
              className="px-3 py-1.5 rounded-full bg-chip hairline text-[12px] text-ink-2 hover:text-ink hover:bg-chip-2 transition-colors disabled:opacity-50"
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Recent — Apple Music / Spotify style square tile grid */}
        {recent.length > 0 && (
          <section>
            <h2 className="text-ink-3 text-[11px] font-medium uppercase tracking-[0.18em] mb-3">
              Recent
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
              {recent.map((c) => {
                const cover = formatArtwork(c.playlist_cover, 400);
                const title = displayTitle(c);
                const gradient = FALLBACK_GRADIENTS[hashIndex(c.id, FALLBACK_GRADIENTS.length)];
                return (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/chat/${c.id}`)}
                    className="group text-left flex flex-col gap-1.5 transition-transform hover:-translate-y-0.5"
                  >
                    <div className="aspect-square w-full rounded-card overflow-hidden relative shadow-cover">
                      {cover ? (
                        <img
                          src={cover}
                          alt={title}
                          className="absolute inset-0 w-full h-full object-cover"
                          loading="lazy"
                          draggable={false}
                        />
                      ) : (
                        <div
                          className="absolute inset-0 flex items-center justify-center"
                          style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}
                        >
                          <span className="text-white/85 text-[28px] font-display font-medium">
                            {firstChar(title)}
                          </span>
                        </div>
                      )}
                      {(c.playlist_count ?? 0) > 0 && (
                        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-black/45 backdrop-blur-md text-[10px] text-white/85 font-medium">
                          {c.playlist_count}
                        </div>
                      )}
                    </div>
                    <div className="text-ink text-[12px] font-medium line-clamp-2 leading-snug px-0.5">
                      {title}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
