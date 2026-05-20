import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

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
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ bottom: 0, left: 0 });

  const currentLang = i18n.resolvedLanguage === 'zh' ? 'zh' : 'en';
  const toggleLang = () => {
    i18n.changeLanguage(currentLang === 'zh' ? 'en' : 'zh');
  };

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
        className="w-8 h-8 rounded-full bg-accent text-page flex items-center justify-center font-semibold text-xs shrink-0 hover:bg-accent-2 transition-colors cursor-pointer"
      >
        {initials}
      </button>

      {/* Popover - portaled to body */}
      {open && createPortal(
        <div
          ref={popoverRef}
          style={{ bottom: position.bottom, left: position.left }}
          className="fixed w-56 glass-strong rounded-2xl shadow-glass py-2 z-50"
        >
          {/* User info header */}
          <div className="px-4 py-3 hairline-b">
            <p className="text-[13px] text-ink-2 truncate">{userEmail}</p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            {/* Settings */}
            <button
              className="w-full px-4 py-2.5 text-left text-[13px] text-ink hover:bg-chip transition-colors flex items-center gap-3"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
            >
              <svg className="w-4 h-4 text-ink-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>{t('common.settings')}</span>
            </button>

            {/* Language toggle */}
            <button
              className="w-full px-4 py-2.5 text-left text-[13px] text-ink hover:bg-chip transition-colors flex items-center gap-3"
              onClick={toggleLang}
            >
              <svg className="w-4 h-4 text-ink-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span className="flex-1">{t('settings.language')}</span>
              <span className="text-ink-3 text-[12px]">
                {currentLang === 'zh' ? t('settings.languageZh') : t('settings.languageEn')}
              </span>
            </button>
          </div>

          {/* Divider + Logout */}
          <div className="hairline-t mt-1 pt-1">
            <button
              onClick={() => {
                onLogout();
                setOpen(false);
              }}
              className="w-full px-4 py-2.5 text-left text-[13px] text-ink hover:bg-chip transition-colors flex items-center gap-3"
            >
              <svg className="w-4 h-4 text-ink-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>{t('common.logout')}</span>
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
