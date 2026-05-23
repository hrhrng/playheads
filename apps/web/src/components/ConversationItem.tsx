import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Conversation } from '../types/global.d.ts';

interface ConversationItemProps {
  conversation: Conversation;
  expanded: boolean;
  isActive?: boolean;
  onSelect?: (id: string) => void;
  onPin?: (id: string, isPinned: boolean) => void;
  onRename?: (id: string, newTitle: string) => void;
  onDelete?: (id: string) => void;
}

export const ConversationItem = ({
  conversation: conv,
  expanded,
  isActive = false,
  onSelect,
  onPin,
  onRename,
  onDelete,
}: ConversationItemProps): React.JSX.Element => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dotBtnRef = useRef<HTMLButtonElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        dotBtnRef.current && !dotBtnRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const startRename = () => {
    setEditing(true);
    setEditTitle(conv.title || '');
  };

  const handleRenameSave = () => {
    if (editTitle.trim()) {
      onRename?.(conv.id, editTitle.trim());
    }
    setEditing(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      handleRenameSave();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setEditing(false);
    }
  };

  return (
    <div className="group relative mx-3">
      <button
        onClick={() => onSelect?.(conv.id)}
        className={`
          w-full p-3 rounded-2xl transition-colors flex items-center overflow-hidden
          ${isActive ? 'bg-chip-2 text-ink font-medium hairline' : 'text-ink-2 hover:bg-chip hover:text-ink'}
        `}
      >
        {/* Icon — vinyl disc. Filled body + page-bg label disc + ink
            spindle. Mirrors the New Chat button's `ml-1 + w-6` container
            so all sidebar icons sit on the same vertical centerline. */}
        <div className="w-6 flex justify-center shrink-0 ml-1">
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="currentColor" />
            <circle cx="12" cy="12" r="3.5" fill="rgb(var(--page))" />
            <circle cx="12" cy="12" r="1" fill="currentColor" />
          </svg>
        </div>

        {/* Title or inline edit */}
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={handleRenameSave}
            onClick={(e) => e.stopPropagation()}
            className="ml-3 flex-1 bg-transparent border-none outline-none text-[14px] font-medium text-ink p-0 min-w-0"
          />
        ) : (
          <span
            className={`ml-3 truncate text-[14px] font-medium text-left transition-[padding] duration-75 ease-out ${expanded ? `opacity-100 flex-1 group-hover:pr-7${menuOpen ? ' pr-7' : ''}` : 'opacity-0 w-0 ml-0 overflow-hidden'}`}
            onDoubleClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              startRename();
            }}
          >
            {conv.title || t('common.newConversation')}
          </span>
        )}
      </button>

      {/* Three-dot menu button */}
      {expanded && !editing && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <button
            ref={dotBtnRef}
            data-testid="menu-button"
            onClick={(e) => {
              e.stopPropagation();
              if (menuOpen) {
                setMenuOpen(false);
              } else {
                // Position: right-below the button (like ChatGPT)
                const rect = dotBtnRef.current?.getBoundingClientRect();
                if (rect) {
                  const menuHeight = 130;
                  const spaceBelow = window.innerHeight - rect.bottom;
                  const top = spaceBelow < menuHeight ? rect.top - menuHeight : rect.bottom + 4;
                  setMenuPos({ top, left: rect.left });
                }
                setMenuOpen(true);
              }
            }}
            className={`p-1 rounded-lg text-ink-3 hover:bg-chip-2 hover:text-ink transition-all duration-200
              ${menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
            `}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="6" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="18" r="1.5" />
            </svg>
          </button>
        </div>
      )}

      {/* Dropdown menu — rendered via portal to escape overflow clipping */}
      {menuOpen && createPortal(
        <div
          ref={menuRef}
          className="fixed w-44 glass-strong rounded-2xl shadow-glass py-1 z-[9999]"
          style={{ top: menuPos?.top ?? 0, left: menuPos?.left ?? 0 }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPin?.(conv.id, !conv.is_pinned);
              setMenuOpen(false);
            }}
            className="w-full px-3 py-2 text-[13px] text-left flex items-center gap-2.5 text-ink hover:bg-chip transition-colors"
          >
            <svg className="w-4 h-4" fill={conv.is_pinned ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            {conv.is_pinned ? t('common.unpinChat') : t('common.pinChat')}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
              startRename();
            }}
            className="w-full px-3 py-2 text-[13px] text-left flex items-center gap-2.5 text-ink hover:bg-chip transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            {t('common.rename')}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
              onDelete?.(conv.id);
            }}
            className="w-full px-3 py-2 text-[13px] text-left flex items-center gap-2.5 text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
            {t('common.delete')}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
};
