import { useState, useEffect } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAppleMusicAuthorized?: boolean;
  onConnectAppleMusic?: () => void;
  onDisconnectAppleMusic?: () => void;
}

type Tab = 'general' | 'integrations';

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'general',
    label: 'General',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
  {
    id: 'integrations',
    label: 'Integrations',
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
  return (
    <div>
      <h2 className="text-lg font-semibold text-gemini-text mb-6">General</h2>
      <div className="space-y-0 divide-y divide-gemini-border">
        {/* Appearance */}
        <div className="flex items-center justify-between py-4">
          <span className="text-sm text-gemini-text">Appearance</span>
          <select className="text-sm text-gemini-subtext bg-transparent border border-gemini-border rounded-lg px-3 py-1.5 cursor-pointer hover:border-gemini-text transition-colors outline-none">
            <option>System</option>
            <option>Light</option>
            <option>Dark</option>
          </select>
        </div>

        {/* Language */}
        <div className="flex items-center justify-between py-4">
          <span className="text-sm text-gemini-text">Language</span>
          <select className="text-sm text-gemini-subtext bg-transparent border border-gemini-border rounded-lg px-3 py-1.5 cursor-pointer hover:border-gemini-text transition-colors outline-none">
            <option>Auto-detect</option>
            <option>English</option>
            <option>中文</option>
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
  return (
    <div>
      <h2 className="text-lg font-semibold text-gemini-text mb-6">Integrations</h2>
      <div className="space-y-0 divide-y divide-gemini-border">
        {/* Apple Music */}
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-pink-500 to-red-500 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gemini-text">Apple Music</p>
              <p className="text-xs text-gemini-subtext">
                {isAppleMusicAuthorized ? 'Connected' : 'Enable full playback and recommendations'}
              </p>
            </div>
          </div>
          {isAppleMusicAuthorized ? (
            <button
              onClick={onDisconnect}
              className="text-sm px-4 py-1.5 rounded-lg border border-gemini-border text-gemini-subtext hover:border-red-300 hover:text-red-600 transition-colors"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={onConnect}
              className="text-sm px-4 py-1.5 rounded-lg border border-gemini-primary text-gemini-primary hover:bg-gemini-primary hover:text-white transition-colors"
            >
              Connect
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
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[480px] flex overflow-hidden animate-scale-in">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gemini-subtext hover:text-gemini-text hover:bg-gemini-hover transition-colors z-10"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Left sidebar */}
        <nav className="w-48 shrink-0 border-r border-gemini-border py-4 px-3 flex flex-col gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full px-3 py-2 rounded-lg text-sm text-left flex items-center gap-2.5 transition-colors ${
                activeTab === tab.id
                  ? 'bg-gemini-hover font-medium text-gemini-text'
                  : 'text-gemini-subtext hover:bg-gemini-hover hover:text-gemini-text'
              }`}
            >
              {tab.icon}
              {tab.label}
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
