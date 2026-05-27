/**
 * AddToPlaylistButton — small "+" button that opens a popover listing the
 * user's custom playlists. Clicking a row adds the supplied track to that
 * playlist via POST /api/playlists/:id/add-track (idempotent on the server).
 *
 * The Liked playlist is intentionally excluded — the standalone heart icon
 * already covers it with toggle semantics. We only surface custom (user-
 * created, !is_liked) playlists here.
 *
 * The popover is portal'd to <body> so it isn't clipped by any ancestor
 * `overflow: hidden`. Vertical placement flips above the trigger if there
 * isn't enough room below — matches the ConversationItem dropdown pattern.
 *
 * @module components/AddToPlaylistButton
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../config/api';
import type { UnifiedTrack } from '../providers/types';
import type { Conversation } from '../types';

interface AddToPlaylistButtonProps {
  /** Track to add. If null, button is disabled. */
  track: UnifiedTrack | null;
  /** Auth user id. */
  userId: string | null;
  /** Full conversations list — we filter to custom playlists locally. */
  conversations: Conversation[];
  /** Refetch trigger so the sidebar / list reflects the new track. */
  onMutated?: () => void;
  /** Optional className override for sizing — defaults to w-9 h-9 (matches Like). */
  className?: string;
  /** Optional icon size override — defaults to w-[18px]. */
  iconClassName?: string;
}

type Status = 'idle' | 'adding' | 'added' | 'duplicate' | 'error';

export const AddToPlaylistButton = ({
  track,
  userId,
  conversations,
  onMutated,
  className,
  iconClassName,
}: AddToPlaylistButtonProps): React.JSX.Element => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  /** Per-playlist status, so each row can show its own feedback */
  const [rowStatus, setRowStatus] = useState<Record<string, Status>>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Custom playlists only — exclude Liked (covered by the heart) and chats.
  const playlists = useMemo(
    () => conversations.filter((c) => c.type === 'playlist' && !c.is_liked),
    [conversations],
  );

  // Reset row feedback whenever popover reopens or track changes.
  useEffect(() => {
    if (!open) setRowStatus({});
  }, [open, track?.id]);

  // Outside-click closes.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popRef.current && !popRef.current.contains(target) &&
        btnRef.current && !btnRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const handleToggle = useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      // Estimate the popover height generously so we flip early rather than
      // overrun the viewport with a long playlist list.
      const popHeight = Math.min(320, 56 + playlists.length * 44);
      const popWidth = 240;
      const margin = 8;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < popHeight + margin
        ? Math.max(margin, rect.top - popHeight - margin)
        : rect.bottom + margin;
      // Right-anchor to the button so the popover doesn't run off-screen on
      // narrow viewports.
      const left = Math.max(margin, Math.min(rect.right - popWidth, window.innerWidth - popWidth - margin));
      setPos({ top, left });
    }
    setOpen(true);
  }, [open, playlists.length]);

  const handleAdd = useCallback(async (playlistId: string) => {
    if (!track || !userId) return;
    setRowStatus((s) => ({ ...s, [playlistId]: 'adding' }));
    try {
      const res = await fetch(`${API_BASE}/playlists/${playlistId}/add-track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, track }),
      });
      if (!res.ok) throw new Error(`add-track ${res.status}`);
      const data = (await res.json()) as { added: boolean; alreadyPresent: boolean };
      setRowStatus((s) => ({
        ...s,
        [playlistId]: data.alreadyPresent ? 'duplicate' : 'added',
      }));
      onMutated?.();
      // Close after a short delay so the user sees the confirmation tick.
      setTimeout(() => setOpen(false), 700);
    } catch (e) {
      console.warn('[AddToPlaylistButton] add failed', e);
      setRowStatus((s) => ({ ...s, [playlistId]: 'error' }));
    }
  }, [track, userId, onMutated]);

  const disabled = !userId || !track;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        title={t('addToPlaylist.button')}
        aria-label={t('addToPlaylist.button')}
        aria-expanded={open}
        className={
          className ??
          'w-9 h-9 rounded-full flex items-center justify-center transition-all hairline bg-chip text-ink-2 hover:text-ink hover:bg-chip-2 disabled:opacity-40'
        }
      >
        <svg className={iconClassName ?? 'w-[18px] h-[18px]'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {/* "save to playlist": list lines + plus */}
          <line x1="3" y1="6" x2="15" y2="6" />
          <line x1="3" y1="12" x2="15" y2="12" />
          <line x1="3" y1="18" x2="11" y2="18" />
          <line x1="19" y1="14" x2="19" y2="22" />
          <line x1="15" y1="18" x2="23" y2="18" />
        </svg>
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          className="fixed w-60 glass-strong rounded-2xl shadow-glass z-[9999] overflow-hidden"
          style={{ top: pos.top, left: pos.left }}
          role="menu"
        >
          <div className="px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-ink-3 hairline-b">
            {t('addToPlaylist.header')}
          </div>
          {playlists.length === 0 ? (
            <div className="px-3 py-4 text-[12px] text-ink-3 leading-relaxed">
              {t('addToPlaylist.empty')}
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {playlists.map((pl) => {
                const status = rowStatus[pl.id] ?? 'idle';
                const inactive = status === 'adding' || status === 'added' || status === 'duplicate';
                return (
                  <li key={pl.id}>
                    <button
                      type="button"
                      onClick={() => handleAdd(pl.id)}
                      disabled={inactive}
                      className="w-full px-3 py-2 text-[13px] text-left flex items-center gap-2.5 text-ink hover:bg-chip transition-colors disabled:opacity-70"
                    >
                      <div className="w-6 h-6 rounded-card bg-chip overflow-hidden flex items-center justify-center shrink-0">
                        {pl.playlist_cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={pl.playlist_cover.replace('{w}', '60').replace('{h}', '60')} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <svg className="w-3.5 h-3.5 text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M9 18V5l12-2v13" />
                            <circle cx="6" cy="18" r="2.5" fill="currentColor" stroke="none" />
                            <circle cx="18" cy="16" r="2.5" fill="currentColor" stroke="none" />
                          </svg>
                        )}
                      </div>
                      <span className="flex-1 truncate">{pl.title || t('addToPlaylist.untitled')}</span>
                      {/* Trailing status icon */}
                      {status === 'added' && (
                        <svg className="w-4 h-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                      {status === 'duplicate' && (
                        <span className="text-[10px] uppercase tracking-wider text-ink-3">{t('addToPlaylist.already')}</span>
                      )}
                      {status === 'adding' && (
                        <div className="w-3.5 h-3.5 border-2 border-ink-3 border-t-transparent rounded-full animate-spin" />
                      )}
                      {status === 'error' && (
                        <span className="text-[10px] uppercase tracking-wider text-red-500">{t('addToPlaylist.failed')}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>,
        document.body,
      )}
    </>
  );
};
