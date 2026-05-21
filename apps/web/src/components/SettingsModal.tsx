import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSubscription, startCheckout, openCustomerPortal, type Tier } from '../hooks/useSubscription';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null;
  userEmail?: string;
  isAppleMusicAuthorized?: boolean;
  onConnectAppleMusic?: () => void;
  onDisconnectAppleMusic?: () => void;
}

type Tab = 'general' | 'integrations' | 'billing';

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
  {
    id: 'billing',
    labelKey: 'settings.billing',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
  },
];

interface PlanCardProps {
  tier: 'plus' | 'pro';
  priceLabel: string;
  currentTier: Tier;
  perks: string[];
  onUpgrade: (tier: 'plus' | 'pro') => void;
  busy: boolean;
}

function PlanCard({ tier, priceLabel, currentTier, perks, onUpgrade, busy }: PlanCardProps) {
  const { t } = useTranslation();
  const isCurrent = currentTier === tier;
  const isDowngradeFromHigher = currentTier === 'pro' && tier === 'plus';

  return (
    <div className={`relative rounded-2xl p-4 hairline flex flex-col ${isCurrent ? 'bg-chip-2' : 'bg-chip/40'}`}>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-base font-medium text-ink capitalize">{t(`billing.tier.${tier}`)}</h3>
        <span className="text-sm text-ink-2">{priceLabel}</span>
      </div>
      <ul className="space-y-1.5 mb-4 flex-1">
        {perks.map((p, i) => (
          <li key={i} className="text-xs text-ink-2 flex items-start gap-1.5">
            <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{p}</span>
          </li>
        ))}
      </ul>
      {isCurrent ? (
        <div className="text-xs text-ink-3 text-center py-1.5">{t('billing.currentPlan')}</div>
      ) : isDowngradeFromHigher ? (
        <div className="text-xs text-ink-3 text-center py-1.5">{t('billing.manageToDowngrade')}</div>
      ) : (
        <button
          onClick={() => onUpgrade(tier)}
          disabled={busy}
          className="w-full text-sm py-1.5 rounded-full border border-accent text-accent hover:bg-accent hover:text-page transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? t('common.loading') : t('billing.upgrade')}
        </button>
      )}
    </div>
  );
}

function BillingTab({ userId, userEmail }: { userId: string | null; userEmail: string }) {
  const { t } = useTranslation();
  const { summary, loading } = useSubscription(userId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentTier: Tier = summary?.tier ?? 'free';

  const handleUpgrade = async (tier: 'plus' | 'pro') => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      const url = await startCheckout(userId, tier, userEmail || undefined);
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const handleManage = async () => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      const url = await openCustomerPortal(userId);
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const renewLabel = summary?.current_period_end
    ? new Date(summary.current_period_end).toLocaleDateString()
    : null;

  return (
    <div>
      <h2 className="text-lg font-display font-medium text-ink mb-6">{t('settings.billing')}</h2>

      {/* Current plan banner */}
      <div className="mb-6 rounded-2xl p-4 bg-chip-2">
        <p className="text-xs text-ink-3 uppercase tracking-wide mb-1">{t('billing.currentPlan')}</p>
        <p className="text-lg font-medium text-ink capitalize">{t(`billing.tier.${currentTier}`)}</p>
        {currentTier !== 'free' && summary && (
          <p className="text-xs text-ink-3 mt-1">
            {summary.cancel_at_period_end
              ? t('billing.cancelsOn', { date: renewLabel })
              : renewLabel
                ? t('billing.renewsOn', { date: renewLabel })
                : null}
          </p>
        )}
        {currentTier !== 'free' && summary?.has_customer && (
          <button
            onClick={handleManage}
            disabled={busy}
            className="mt-3 text-xs text-accent hover:underline disabled:opacity-40"
          >
            {t('billing.manage')} →
          </button>
        )}
      </div>

      {/* Plans */}
      <div className="grid grid-cols-2 gap-3">
        <PlanCard
          tier="plus"
          priceLabel="$9.99/mo"
          currentTier={currentTier}
          perks={[t('billing.perks.unlimited'), t('billing.perks.priorityModel')]}
          onUpgrade={handleUpgrade}
          busy={busy}
        />
        <PlanCard
          tier="pro"
          priceLabel="$19.99/mo"
          currentTier={currentTier}
          perks={[
            t('billing.perks.unlimited'),
            t('billing.perks.advancedModel'),
            t('billing.perks.earlyAccess'),
          ]}
          onUpgrade={handleUpgrade}
          busy={busy}
        />
      </div>

      {loading && <p className="text-xs text-ink-3 mt-4">{t('common.loading')}</p>}
      {error && <p className="text-xs text-red-500 mt-4">{error}</p>}
    </div>
  );
}

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
            <div className="w-9 h-9 rounded-card bg-gradient-to-br from-fuchsia-500 via-pink-500 to-rose-500 flex items-center justify-center shrink-0 shadow-sm">
              {/* Apple Music brand mark — official path from simple-icons (CC0). */}
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor" aria-label="Apple Music">
                <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.106 1.596-.35 2.295-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.045-1.773-.6-1.943-1.536a1.88 1.88 0 011.038-2.022c.323-.16.67-.25 1.018-.324.378-.082.758-.153 1.134-.24.274-.063.457-.23.51-.516a.904.904 0 00.02-.193c0-1.815 0-3.63-.002-5.443a.725.725 0 00-.026-.185c-.04-.15-.15-.243-.304-.234-.16.01-.318.035-.475.066-.76.15-1.52.303-2.28.456l-2.325.47-1.374.278c-.016.003-.032.01-.048.013-.277.077-.377.203-.39.49-.002.042 0 .086 0 .13-.002 2.602 0 5.204-.003 7.805 0 .42-.047.836-.215 1.227-.278.64-.77 1.04-1.434 1.233-.35.1-.71.16-1.075.172-.96.036-1.755-.6-1.92-1.544-.14-.812.23-1.685 1.154-2.075.357-.15.73-.232 1.108-.31.287-.06.575-.116.86-.177.383-.083.583-.323.6-.714v-.15c0-2.96 0-5.922.002-8.882 0-.123.013-.25.042-.37.07-.285.273-.448.546-.518.255-.066.515-.112.774-.165.733-.15 1.466-.296 2.2-.444l2.27-.46c.67-.134 1.34-.27 2.01-.403.22-.043.442-.088.663-.106.31-.025.523.17.554.482.008.073.012.148.012.223.002 1.91.002 3.822 0 5.732z" />
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
  userId = null,
  userEmail = '',
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

      {/* Dialog. Pin neutral palette so mood-shifted --ink / --accent on the
          root don't tint Settings text. */}
      <div
        className="relative glass-strong rounded-sheet shadow-glass w-full max-w-2xl h-[480px] flex overflow-hidden animate-scale-in"
        style={{
          ['--ink' as string]: '216 207 191',
          ['--accent' as string]: '216 207 191',
          ['--accent-2' as string]: '180 170 152',
        }}
      >
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
          {activeTab === 'billing' && (
            <BillingTab userId={userId} userEmail={userEmail} />
          )}
        </div>
      </div>
    </div>
  );
}
