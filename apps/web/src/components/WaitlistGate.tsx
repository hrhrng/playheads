import { useTranslation } from 'react-i18next';

interface WaitlistGateProps {
  email?: string;
  onLogout: () => void;
}

export function WaitlistGate({ email, onLogout }: WaitlistGateProps) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center space-y-8 max-w-sm w-full animate-fade-in">
        <div className="w-24 h-24 rounded-full overflow-hidden shadow-cover">
          <img src="/logo.jpg" alt="Playhead" className="w-full h-full object-cover scale-105" />
        </div>

        <div className="text-center space-y-3">
          <h1 className="text-xl font-display font-medium tracking-tight text-ink">{t('waitlist.title')}</h1>
          <div className="h-px w-12 bg-rule mx-auto" />
          <p className="text-sm font-display text-ink-2 leading-relaxed">
            {t('waitlist.subtitlePrefix')}{' '}
            <span className="font-medium text-ink">{email}</span>{' '}
            {t('waitlist.subtitleSuffix')}
          </p>
        </div>

        {/* Music bars decoration */}
        <div className="flex items-end gap-[3px] h-6">
          <div className="w-[3px] bg-accent rounded-full animate-music-bar-1" style={{ height: '20%' }} />
          <div className="w-[3px] bg-accent rounded-full animate-music-bar-2" style={{ height: '20%' }} />
          <div className="w-[3px] bg-accent rounded-full animate-music-bar-3" style={{ height: '20%' }} />
        </div>

        <button
          onClick={onLogout}
          className="text-sm text-ink-3 hover:text-ink transition-colors"
        >
          {t('common.logout')}
        </button>
      </div>
    </div>
  );
}
