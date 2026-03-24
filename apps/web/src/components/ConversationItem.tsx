import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
    <div className="group relative mx-2">
      <button
        onClick={() => onSelect?.(conv.id)}
        className={`
          w-full p-3 rounded-xl transition-colors flex items-center overflow-hidden
          ${isActive ? 'bg-white text-gemini-text font-medium' : 'text-gemini-subtext hover:bg-white'}
        `}
      >
        {/* Icon */}
        <div className="w-6 flex justify-center shrink-0">
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
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
            className="ml-3 flex-1 bg-transparent border-none outline-none text-sm font-medium text-gemini-text p-0 min-w-0"
          />
        ) : (
          <span
            className={`ml-3 truncate text-sm font-medium text-left transition-[padding] duration-75 ease-out ${expanded ? `opacity-100 flex-1 group-hover:pr-7${menuOpen ? ' pr-7' : ''}` : 'opacity-0 w-0 ml-0 overflow-hidden'}`}
            onDoubleClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              startRename();
            }}
          >
            {conv.title || 'New Conversation'}
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
            className={`p-1 rounded-lg text-gemini-subtext hover:bg-gemini-hover hover:text-gemini-text transition-all duration-200
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
          className="fixed w-44 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-[9999]"
          style={{ top: menuPos?.top ?? 0, left: menuPos?.left ?? 0 }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPin?.(conv.id, !conv.is_pinned);
              setMenuOpen(false);
            }}
            className="w-full px-3 py-2 text-sm text-left flex items-center gap-2.5 text-gemini-text hover:bg-gemini-hover transition-colors"
          >
            <svg className="w-4 h-4" fill={conv.is_pinned ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            {conv.is_pinned ? 'Unpin chat' : 'Pin chat'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
              startRename();
            }}
            className="w-full px-3 py-2 text-sm text-left flex items-center gap-2.5 text-gemini-text hover:bg-gemini-hover transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Rename
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
              onDelete?.(conv.id);
            }}
            className="w-full px-3 py-2 text-sm text-left flex items-center gap-2.5 text-red-600 hover:bg-red-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
            Delete
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
};
