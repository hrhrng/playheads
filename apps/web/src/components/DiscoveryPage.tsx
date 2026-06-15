/**
 * DiscoveryPage — cold-start landing.
 *
 * Empty-state for the home route: chat-style layout (ChatInput sticky
 * at the bottom, suggestions in the body). Not a Spotify-style browse
 * page — the mental model is "I'm about to chat to start a topic".
 */
import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChatInput } from './chat/ChatInput';
import { MiniPlayer } from './MiniPlayer';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { API_BASE } from '../config/api';
import { displayConversationTitle } from '../utils/conversationTitle';
import type { Conversation, PlaybackTime } from '../types';
import type { UnifiedTrack } from '../providers/types';

type Attachment = {
  file: File;
  status: 'uploading' | 'done' | 'error';
  remoteUrl?: string;
  error?: string;
};

interface DiscoveryPageProps {
  conversations: Conversation[];
  userId: string | null;
  onSessionCreated?: () => void;
  /** For the MiniPlayer rendered above the composer when something's
   *  playing. Discovery is a non-feed page so a compact always-on bar
   *  keeps controls within reach. */
  currentTrack: UnifiedTrack | null;
  isPlaying: boolean;
  togglePlay: () => void;
  onSkipNext?: () => void;
  playbackTime: PlaybackTime;
  onSeek: (seconds: number) => void;
}

// Mood chip keys — labels and prompts come from i18n (moods.<key>.label,
// moods.<key>.prompt) so each locale can phrase the prompt natively.
const MOOD_KEYS = ['focus', 'sad', 'high_energy', 'chill', 'surprise', 'workout', 'sleep'] as const;

function formatArtwork(url: string | null | undefined, size = 80): string | null {
  if (!url) return null;
  return url.replace('{w}', String(size)).replace('{h}', String(size));
}

export function DiscoveryPage({
  conversations,
  userId,
  onSessionCreated,
  currentTrack,
  isPlaying,
  togglePlay,
  onSkipNext,
  playbackTime,
  onSeek,
}: DiscoveryPageProps) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [input, setInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Voice — click the mic to start dictation, click again to stop.
  // Transcripts are appended to whatever the user has already typed so
  // dictation composes.
  const {
    isRecording,
    isTranscribing,
    mediaRecorder,
    startHold,
    endHold,
    cancelHold,
  } = useVoiceInput({
    lang: i18n.language,
    onTranscript: (text) =>
      setInput((prev) => (prev ? `${prev} ${text}` : text)),
    onError: (msg) => console.warn('[DiscoveryPage] voice input error', msg),
  });

  // Mirror ChatInterface's upload pipeline so attachments behave the same
  // whether the user attaches from cold start or inside an active chat.
  const uploadFile = useCallback(async (file: File): Promise<string> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/uploads/image`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`upload failed ${res.status}`);
    const json = (await res.json()) as { url: string };
    return json.url;
  }, []);

  const handleAttach = useCallback((files: File[]) => {
    const newOnes: Attachment[] = files.map((f) => ({ file: f, status: 'uploading' as const }));
    setAttachments((prev) => [...prev, ...newOnes]);
    newOnes.forEach((att) => {
      uploadFile(att.file).then(
        (url) => {
          setAttachments((prev) =>
            prev.map((a) => (a.file === att.file ? { ...a, status: 'done', remoteUrl: url } : a)),
          );
        },
        (err: Error) => {
          console.error('[DiscoveryPage upload]', err);
          setAttachments((prev) =>
            prev.map((a) => (a.file === att.file ? { ...a, status: 'error', error: err.message } : a)),
          );
        },
      );
    });
  }, [uploadFile]);

  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const startNewTopic = useCallback(
    async (initialMessage?: string) => {
      if (!userId || isCreating) return;
      setIsCreating(true);
      try {
        // Resolve attachment URLs to absolute FileUIPart objects.
        const doneAttachments = attachments.filter((a) => a.status === 'done' && a.remoteUrl);
        const initialFiles = doneAttachments.length > 0
          ? doneAttachments.map((a) => ({
              type: 'file' as const,
              mediaType: a.file.type,
              url: new URL(a.remoteUrl!, window.location.origin).toString(),
              filename: a.file.name,
            }))
          : undefined;

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
          state: {
            isNewlyCreated: true,
            ...(initialMessage ? { initialMessage } : {}),
            ...(initialFiles ? { initialFiles } : {}),
          },
        });
      } catch (e) {
        console.error('[DiscoveryPage] new topic failed:', e);
        toast.error(t('discovery.failedToStart'), { description: String(e).slice(0, 200) });
      } finally {
        setIsCreating(false);
      }
    },
    [userId, isCreating, attachments, navigate, onSessionCreated, t],
  );

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    const hasAttachments = attachments.some((a) => a.status === 'done');
    if (!trimmed && !hasAttachments) return;
    startNewTopic(trimmed || t('discovery.imagePlaceholderMessage'));
  }, [input, attachments, startNewTopic, t]);

  // MiniPlayer "expand to feed" — jump to the most-recently-updated chat
  // (the feed lives on /chat/:id for chat-type conversations). If the user
  // has no chats yet (only playlists, or fresh account), spawn one so
  // they always land somewhere with a RecordPlayer.
  const handleExpandFeed = useCallback(async () => {
    const recentChat = conversations.find((c) => c.type !== 'playlist');
    if (recentChat) {
      navigate(`/chat/${recentChat.id}`);
      return;
    }
    if (!userId) return;
    try {
      const res = await fetch(`${API_BASE}/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) throw new Error(`session/create ${res.status}`);
      const { session_id } = (await res.json()) as { session_id: string };
      onSessionCreated?.();
      navigate(`/chat/${session_id}`);
    } catch (e) {
      console.error('[DiscoveryPage] expand-to-feed failed:', e);
    }
  }, [conversations, userId, navigate, onSessionCreated]);

  // Split the conversation feed into two parallel sections so the user can
  // visually distinguish "places I curated" (playlists) from "places I
  // chatted" (chats). The same row layout is reused; only the section
  // header differs. Liked (an isLiked playlist) is pinned to the top of
  // the playlists group, matching the left-sidebar ordering.
  const { playlists, recentChats } = useMemo(() => {
    const pls: Conversation[] = [];
    const chs: Conversation[] = [];
    for (const c of conversations) {
      if (c.type === 'playlist') pls.push(c);
      else chs.push(c);
    }
    pls.sort((a, b) => {
      if (a.is_liked && !b.is_liked) return -1;
      if (!a.is_liked && b.is_liked) return 1;
      // Already sorted by updated_at desc upstream — preserve order.
      return 0;
    });
    return { playlists: pls.slice(0, 8), recentChats: chs.slice(0, 8) };
  }, [conversations]);

  const renderRow = (c: Conversation) => {
    const cover = formatArtwork(c.playlist_cover, 80);
    const title = displayConversationTitle(c, t('discovery.title'));
    return (
      <button
        key={c.id}
        onClick={() => navigate(`/chat/${c.id}`)}
        className="group flex items-center gap-3 px-1.5 py-2 rounded-xl text-left hover:bg-chip transition-colors"
      >
        <div className="w-9 h-9 rounded-card overflow-hidden bg-chip-2 shrink-0 flex items-center justify-center">
          {cover ? (
            <img src={cover} alt={title} className="w-full h-full object-cover" loading="lazy" draggable={false} />
          ) : c.is_liked ? (
            <svg className="w-4 h-4 text-rose-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 21s-7-4.35-9.5-8.5C.5 9 2.5 5 6.5 5c2.5 0 3.99 1.5 5.5 3 1.51-1.5 3-3 5.5-3 4 0 6 4 4 7.5C19 16.65 12 21 12 21z" />
            </svg>
          ) : null}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-ink text-[14px] truncate leading-tight">{title}</div>
          {(c.playlist_count ?? 0) > 0 && (
            <div className="text-ink-4 text-[11px] mt-0.5">{t('discovery.trackCount', { count: c.playlist_count ?? 0 })}</div>
          )}
        </div>
        <svg className="w-4 h-4 text-ink-4 group-hover:text-ink-3 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Body — suggestions, scrollable if it ever overflows */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 pt-16 pb-6">
          <h1 className="text-ink text-[28px] font-display font-medium tracking-tight text-center mb-2">
            {t('discovery.title')}
          </h1>
          <p className="text-ink-3 text-[14px] text-center mb-10">
            {t('discovery.subtitle')}
          </p>

          {/* Mood chips */}
          <div className="flex flex-wrap justify-center gap-1.5 mb-12">
            {MOOD_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => startNewTopic(t(`moods.${key}.prompt`))}
                disabled={isCreating}
                className="px-3.5 py-1.5 rounded-full bg-chip hairline text-[13px] text-ink-2 hover:text-ink hover:bg-chip-2 transition-colors disabled:opacity-50"
              >
                {t(`moods.${key}.label`)}
              </button>
            ))}
          </div>

          {/* Playlists — curated track collections. Rendered before chats
              because they're the user's persistent, intentional artifacts;
              chats are ephemeral exploration. */}
          {playlists.length > 0 && (
            <section className="mb-8">
              <h2 className="text-ink-3 text-[11px] font-medium uppercase tracking-[0.18em] mb-2 px-1">
                {t('discovery.playlists')}
              </h2>
              <div className="flex flex-col">
                {playlists.map(renderRow)}
              </div>
            </section>
          )}

          {/* Recent chats — type !== 'playlist'. */}
          {recentChats.length > 0 && (
            <section>
              <h2 className="text-ink-3 text-[11px] font-medium uppercase tracking-[0.18em] mb-2 px-1">
                {t('discovery.recentChats')}
              </h2>
              <div className="flex flex-col">
                {recentChats.map(renderRow)}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* ChatInput at the bottom — same wrapper as ChatInterface so the
          composer sits at the identical position visually across cold
          start and active chat. MiniPlayer slots above it when there's
          a playing track (this is a non-feed page). */}
      <div className="shrink-0 px-6 pb-5 pt-10 z-30">
        <MiniPlayer
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          togglePlay={togglePlay}
          onSkipNext={onSkipNext}
          onExpand={handleExpandFeed}
          playbackTime={playbackTime}
          onSeek={onSeek}
        />
        <ChatInput
          input={input}
          isLoading={isCreating}
          isDJSpeaking={false}
          isPlaying={false}
          onInputChange={setInput}
          onSend={handleSend}
          onAttach={handleAttach}
          attachments={attachments.map((a) => a.file)}
          onRemoveAttachment={handleRemoveAttachment}
          onVoiceHoldStart={startHold}
          onVoiceHoldEnd={endHold}
          onVoiceCancel={cancelHold}
          isRecording={isRecording}
          isTranscribing={isTranscribing}
          mediaRecorder={mediaRecorder}
        />
      </div>
    </div>
  );
}
