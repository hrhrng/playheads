import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface UserSettingsPopoverProps {
  userEmail: string;
  userName: string;
  onLogout: () => void;
  onOpenSettings: () => void;
}

export function UserSettingsPopover({
  userEmail,
  userName,
  onLogout,
  onOpenSettings,
}: UserSettingsPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ bottom: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({
      bottom: window.innerHeight - rect.top + 8,
      left: rect.left,
    });
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current && !popoverRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handleToggle = () => {
    if (!open) updatePosition();
    setOpen(!open);
  };

  const initials = userName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      {/* Avatar trigger */}
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-xs shrink-0 hover:bg-blue-600 transition-colors cursor-pointer"
      >
        {initials}
      </button>

      {/* Popover - portaled to body */}
      {open && createPortal(
        <div
          ref={popoverRef}
          style={{ bottom: position.bottom, left: position.left }}
          className="fixed w-56 bg-white rounded-xl shadow-lg border border-gemini-border py-2 z-50"
        >
          {/* User info header */}
          <div className="px-4 py-3 border-b border-gemini-border">
            <p className="text-sm text-gemini-subtext truncate">{userEmail}</p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            {/* Settings */}
            <button
              className="w-full px-4 py-2.5 text-left text-sm text-gemini-text hover:bg-gemini-hover transition-colors flex items-center gap-3"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
            >
              <svg className="w-4 h-4 text-gemini-subtext shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>Settings</span>
            </button>

            {/* Help */}
            <button
              className="w-full px-4 py-2.5 text-left text-sm text-gemini-text hover:bg-gemini-hover transition-colors flex items-center gap-3"
              onClick={() => setOpen(false)}
            >
              <svg className="w-4 h-4 text-gemini-subtext shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>Help</span>
            </button>
          </div>

          {/* Divider + Logout */}
          <div className="border-t border-gemini-border mt-1 pt-1">
            <button
              onClick={() => {
                onLogout();
                setOpen(false);
              }}
              className="w-full px-4 py-2.5 text-left text-sm text-gemini-text hover:bg-gemini-hover transition-colors flex items-center gap-3"
            >
              <svg className="w-4 h-4 text-gemini-subtext shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Log out</span>
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
