/**
 * TrackMenu — generic three-dot ("…") overflow menu.
 *
 * Used as a per-track "more actions" affordance in places where the inline
 * icon row would get too crowded for less-common actions: in PlaylistView
 * rows (Remove from this playlist), in ChatInterface's tools row for the
 * now-playing track (Remove from queue, Open in Apple Music).
 *
 * Caller supplies the items list; the menu just renders + handles open/close
 * + outside-click + viewport-flip placement. Mirrors ConversationItem's
 * dropdown and AddToPlaylistButton's popover patterns so the visual language
 * stays consistent.
 *
 * @module components/TrackMenu
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

export interface TrackMenuItem {
  /** Unique key for this row. */
  key: string;
  /** Visible label. */
  label: string;
  /** Optional leading icon (24x24 SVG element). */
  icon?: React.ReactNode;
  /** Click handler. Receives the close() so handlers can leave the menu
   *  open if they need to (e.g. when chaining into a nested popover). */
  onSelect: (close: () => void) => void;
  /** Danger styling (red label). */
  destructive?: boolean;
  /** Disable the row. */
  disabled?: boolean;
}

interface TrackMenuProps {
  items: TrackMenuItem[];
  /** Visible class on the button (sizing/colours). Defaults match Like. */
  className?: string;
  /** Class for the dots SVG. Defaults to 18×18. */
  iconClassName?: string;
  /** aria-label / title for the button. */
  label?: string;
}

export const TrackMenu = ({ items, className, iconClassName, label }: TrackMenuProps): React.JSX.Element | null => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Outside-click closes the menu.
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

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const itemH = 38;
      const popHeight = Math.min(280, items.length * itemH + 12);
      const popWidth = 200;
      const margin = 8;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < popHeight + margin
        ? Math.max(margin, rect.top - popHeight - margin)
        : rect.bottom + margin;
      const left = Math.max(
        margin,
        Math.min(rect.right - popWidth, window.innerWidth - popWidth - margin),
      );
      setPos({ top, left });
    }
    setOpen(true);
  }, [open, items.length]);

  const close = useCallback(() => setOpen(false), []);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        title={label ?? t('trackMenu.more')}
        aria-label={label ?? t('trackMenu.more')}
        aria-expanded={open}
        className={
          className ??
          'w-9 h-9 rounded-full flex items-center justify-center transition-all hairline bg-chip text-ink-2 hover:text-ink hover:bg-chip-2'
        }
      >
        <svg className={iconClassName ?? 'w-[18px] h-[18px]'} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          className="fixed w-52 glass-strong rounded-2xl shadow-glass py-1 z-[9999] overflow-hidden"
          style={{ top: pos.top, left: pos.left }}
          role="menu"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (item.disabled) return;
                item.onSelect(close);
              }}
              className={`w-full px-3 py-2 text-[13px] text-left flex items-center gap-2.5 transition-colors disabled:opacity-40 ${
                item.destructive
                  ? 'text-red-500 hover:bg-red-500/10'
                  : 'text-ink hover:bg-chip'
              }`}
            >
              {item.icon && <span className="w-4 h-4 shrink-0 flex items-center justify-center">{item.icon}</span>}
              <span className="flex-1 truncate">{item.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
};
