interface WaitlistGateProps {
  email?: string;
  onLogout: () => void;
}

export function WaitlistGate({ email, onLogout }: WaitlistGateProps) {
  return (
    <div className="min-h-screen w-full bg-air-50 flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center space-y-8 max-w-sm w-full animate-fade-in">
        <div className="w-24 h-24 rounded-full overflow-hidden grayscale">
          <img src="/logo.jpg" alt="Playhead" className="w-full h-full object-cover scale-105" />
        </div>

        <div className="text-center space-y-3">
          <h1 className="text-xl font-semibold tracking-tight text-air-900">You're on the list</h1>
          <div className="h-px w-12 bg-air-200 mx-auto" />
          <p className="text-sm text-air-500 leading-relaxed">
            We're letting people in gradually. You'll get an email at{' '}
            <span className="font-medium text-air-900">{email}</span>{' '}
            when it's your turn.
          </p>
        </div>

        {/* Music bars decoration */}
        <div className="flex items-end gap-[3px] h-6">
          <div className="w-[3px] bg-air-300 rounded-full animate-music-bar-1" style={{ height: '20%' }} />
          <div className="w-[3px] bg-air-300 rounded-full animate-music-bar-2" style={{ height: '20%' }} />
          <div className="w-[3px] bg-air-300 rounded-full animate-music-bar-3" style={{ height: '20%' }} />
        </div>

        <button
          onClick={onLogout}
          className="text-sm text-air-400 hover:text-air-900 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
