/**
 * FeedView — TikTok-style cold-start music feed.
 *
 * Renders a single track at a time (cover + title + artist), driven by useFeed.
 * Mood chips swap the feed source. Plays 30s preview via <audio> in useFeed,
 * so no Apple Music user authorization is required.
 */
import { useState, useEffect, useRef } from 'react';
import { useFeed } from '../hooks/useFeed';
import { useAlbumPalette } from '../hooks/useAlbumPalette';
import { useVoiceInput } from '../hooks/useVoiceInput';

const MOOD_CHIPS: Array<{ key: string; label: string }> = [
  { key: 'focus', label: '专注' },
  { key: 'sad', label: '伤心情歌' },
  { key: 'high_energy', label: '高能' },
  { key: 'chill', label: '放空' },
  { key: 'surprise', label: '惊喜我' },
];

export function FeedView() {
  const feed = useFeed({ source: 'editorial' });
  const voice = useVoiceInput();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // React mood/accent palette to the current cover.
  useAlbumPalette(feed.current?.artworkUrl);

  const handleMoodChip = (moodKey: string) => {
    feed.setSource('mood', { moodKey });
  };

  const handleEditorial = () => {
    if (feed.source !== 'editorial') feed.setSource('editorial', {});
  };

  const submitDream = (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    feed.setSource('dream', { prompt: trimmed });
    setChatInput('');
    setDrawerOpen(false);
  };

  // When voice ASR produces a final transcript, send it as a dream prompt.
  useEffect(() => {
    if (voice.transcript) {
      submitDream(voice.transcript);
    }
    // submitDream stable across renders thanks to closure on feed.setSource
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.transcript]);

  // Auto-focus textarea when drawer opens.
  useEffect(() => {
    if (drawerOpen) textareaRef.current?.focus();
  }, [drawerOpen]);

  if (feed.isLoading && !feed.current) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full">
        <div className="w-10 h-10 rounded-full border-2 border-ink/20 border-t-accent animate-spin" />
        <div className="mt-4 text-ink-3 text-sm">正在调音…</div>
      </div>
    );
  }

  if (feed.error && !feed.current) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full px-6 text-center">
        <div className="text-ink text-lg">出了点问题</div>
        <div className="mt-2 text-ink-3 text-sm">{feed.error}</div>
        <button
          onClick={() => feed.setSource(feed.source, {})}
          className="mt-6 px-5 py-2 glass rounded-full text-ink-2 hover:text-ink hover:bg-ink/10 transition-all"
        >
          重试
        </button>
      </div>
    );
  }

  const track = feed.current;
  if (!track) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full text-ink-3">
        队列空了
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full w-full px-6 relative animate-fade-in">
      {/* Cover artwork */}
      <button
        onClick={feed.togglePlay}
        className="relative group focus:outline-none"
        aria-label={feed.isPlaying ? 'Pause' : 'Play'}
      >
        <div className="relative w-72 h-72 sm:w-80 sm:h-80 rounded-3xl overflow-hidden shadow-2xl">
          {track.artworkUrl ? (
            <img
              src={track.artworkUrl}
              alt={track.album || track.name}
              className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full bg-chip" />
          )}
          {/* Play/pause overlay */}
          {!feed.isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
              <svg className="w-16 h-16 text-white drop-shadow-lg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          )}
        </div>
      </button>

      {/* Track info */}
      <div className="mt-8 text-center max-w-md">
        <div className="text-ink text-xl font-display font-medium tracking-tight line-clamp-2">
          {track.name}
        </div>
        <div className="mt-1 text-ink-3 text-[15px] line-clamp-1">{track.artist}</div>
      </div>

      {/* Controls */}
      <div className="mt-8 flex items-center gap-7">
        <button
          onClick={feed.prev}
          disabled={feed.index === 0}
          className="text-ink-2 hover:text-ink disabled:text-ink-4 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous"
        >
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        <button
          onClick={feed.togglePlay}
          className="w-16 h-16 rounded-full bg-accent text-page flex items-center justify-center shadow-xl hover:bg-accent-2 transition-all active:scale-95"
          aria-label={feed.isPlaying ? 'Pause' : 'Play'}
        >
          {feed.isPlaying ? (
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
            </svg>
          ) : (
            <svg className="w-7 h-7 ml-1" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button
          onClick={feed.next}
          className="text-ink-2 hover:text-ink transition-colors"
          aria-label="Next"
        >
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>

        <button
          onClick={feed.like}
          className="text-ink-2 hover:text-accent transition-colors ml-2"
          aria-label="Like"
        >
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
          </svg>
        </button>
      </div>

      {/* Mood chips */}
      <div className="mt-10 w-full max-w-2xl">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={handleEditorial}
            className={`px-4 py-1.5 rounded-full text-[13px] transition-all ${
              feed.source === 'editorial'
                ? 'bg-accent text-page'
                : 'glass text-ink-2 hover:text-ink hover:bg-ink/10'
            }`}
          >
            热门
          </button>
          {MOOD_CHIPS.map((chip) => (
            <button
              key={chip.key}
              onClick={() => handleMoodChip(chip.key)}
              disabled={feed.isLoading}
              className="px-4 py-1.5 glass rounded-full text-[13px] text-ink-2 hover:text-ink hover:bg-ink/10 transition-all disabled:opacity-50"
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Voice + Chat row */}
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            onClick={() => (voice.isListening ? voice.stopListening() : voice.startListening())}
            className={`w-11 h-11 rounded-full glass flex items-center justify-center transition-all ${
              voice.isListening ? 'ring-2 ring-accent animate-pulse' : 'hover:bg-ink/10'
            }`}
            aria-label={voice.isListening ? 'Stop listening' : 'Speak'}
          >
            <svg className="w-5 h-5 text-ink-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
            </svg>
          </button>
          <button
            onClick={() => setDrawerOpen(true)}
            className="px-5 py-2.5 glass rounded-full text-[13px] text-ink-2 hover:text-ink hover:bg-ink/10 transition-all flex items-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            跟它说点想听的
          </button>
        </div>
      </div>

      {/* Preview badge (subtle) */}
      <div className="mt-6 text-[11px] text-ink-4 tracking-wide">
        30s 预览 · 连接 Apple Music 听全曲
      </div>

      {/* Slide-up chat drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <div
        className={`fixed left-0 right-0 bottom-0 z-50 transition-transform duration-300 ease-out ${
          drawerOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto max-w-xl glass rounded-t-3xl px-5 pt-4 pb-6">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/20" />
          <div className="text-ink-3 text-xs mb-2">告诉我你想听什么</div>
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={2}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitDream(chatInput);
                }
                if (e.key === 'Escape') setDrawerOpen(false);
              }}
              placeholder="想专注、想发呆、想被治愈…"
              className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-ink placeholder-ink-3 text-[15px] resize-none py-2 no-scrollbar"
            />
            <button
              onClick={() => submitDream(chatInput)}
              disabled={!chatInput.trim() || feed.isLoading}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-accent text-page disabled:bg-chip disabled:text-ink-4 transition-all flex-shrink-0"
              aria-label="Send"
            >
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-6 6m6-6l6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
