import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAppleMusicAuthorized?: boolean;
  onConnectAppleMusic?: () => void;
  onDisconnectAppleMusic?: () => void;
}

type Tab = 'general' | 'integrations';

const tabs: { id: Tab; labelKey: string; icon: React.ReactNode }[] = [
  {
    id: 'general',
    labelKey: 'settings.general',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
  {
    id: 'integrations',
    labelKey: 'settings.integrations',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
];

function GeneralTab() {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.resolvedLanguage === 'zh' ? 'zh' : 'en';
  return (
    <div>
      <h2 className="text-lg font-display font-medium text-ink mb-6">{t('settings.general')}</h2>
      <div className="space-y-0 divide-y divide-rule">
        {/* Appearance */}
        <div className="flex items-center justify-between py-4">
          <span className="text-sm text-ink">{t('settings.appearance')}</span>
          <select className="text-sm text-ink-2 bg-transparent hairline rounded-full px-3 py-1.5 cursor-pointer hover:text-ink transition-colors outline-none">
            <option>{t('settings.appearanceSystem')}</option>
            <option>{t('settings.appearanceLight')}</option>
            <option>{t('settings.appearanceDark')}</option>
          </select>
        </div>

        {/* Language */}
        <div className="flex items-center justify-between py-4">
          <span className="text-sm text-ink">{t('settings.language')}</span>
          <select
            className="text-sm text-ink-2 bg-transparent hairline rounded-full px-3 py-1.5 cursor-pointer hover:text-ink transition-colors outline-none"
            value={currentLang}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
          >
            <option value="en">{t('settings.languageEn')}</option>
            <option value="zh">{t('settings.languageZh')}</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function IntegrationsTab({
  isAppleMusicAuthorized,
  onConnect,
  onDisconnect,
}: {
  isAppleMusicAuthorized?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <h2 className="text-lg font-display font-medium text-ink mb-6">{t('settings.integrations')}</h2>
      <div className="space-y-0 divide-y divide-rule">
        {/* Apple Music */}
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-card bg-gradient-to-br from-pink-500 to-red-500 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-ink">{t('settings.appleMusic')}</p>
              <p className="text-xs text-ink-3">
                {isAppleMusicAuthorized ? t('settings.connected') : t('settings.appleMusicHint')}
              </p>
            </div>
          </div>
          {isAppleMusicAuthorized ? (
            <button
              onClick={onDisconnect}
              className="text-sm px-4 py-1.5 rounded-full hairline text-ink-2 hover:text-red-500 hover:border-red-500/40 transition-colors"
            >
              {t('settings.disconnect')}
            </button>
          ) : (
            <button
              onClick={onConnect}
              className="text-sm px-4 py-1.5 rounded-full border border-accent text-accent hover:bg-accent hover:text-page transition-colors"
            >
              {t('settings.connect')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SettingsModal({
  isOpen,
  onClose,
  isAppleMusicAuthorized,
  onConnectAppleMusic,
  onDisconnectAppleMusic,
}: SettingsModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('general');

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative glass-strong rounded-sheet shadow-glass w-full max-w-2xl h-[480px] flex overflow-hidden animate-scale-in">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-ink-2 hover:text-ink hover:bg-chip transition-colors z-10"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Left sidebar */}
        <nav className="w-48 shrink-0 hairline-r py-4 px-3 flex flex-col gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full px-3 py-2 rounded-2xl text-sm text-left flex items-center gap-2.5 transition-colors ${
                activeTab === tab.id
                  ? 'bg-chip-2 font-medium text-ink'
                  : 'text-ink-2 hover:bg-chip hover:text-ink'
              }`}
            >
              {tab.icon}
              {t(tab.labelKey)}
            </button>
          ))}
        </nav>

        {/* Right content */}
        <div className="flex-1 p-8 overflow-y-auto">
          {activeTab === 'general' && <GeneralTab />}
          {activeTab === 'integrations' && (
            <IntegrationsTab
              isAppleMusicAuthorized={isAppleMusicAuthorized}
              onConnect={onConnectAppleMusic}
              onDisconnect={onDisconnectAppleMusic}
            />
          )}
        </div>
      </div>
    </div>
  );
}
