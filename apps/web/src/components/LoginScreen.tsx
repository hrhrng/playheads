interface AuthMessage {
  type: 'error' | 'success';
  text: string;
}

interface LoginScreenProps {
  email: string;
  setEmail: (email: string) => void;
  loading: boolean;
  message: AuthMessage | null;
  onLogin: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
}

export function LoginScreen({ email, setEmail, loading, message, onLogin }: LoginScreenProps) {
  return (
    <div className="min-h-screen w-full bg-air-50 flex flex-col items-center justify-center p-6 relative">
      <div className="flex flex-col items-center space-y-12 max-w-sm w-full animate-fade-in">
        {/* Logo */}
        <div className="w-40 h-40 rounded-full overflow-hidden grayscale hover:grayscale-0 transition-all duration-700">
          <img src="/logo.jpg" alt="Playhead" className="w-full h-full object-cover scale-105" />
        </div>

        {/* Title */}
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight text-air-900 font-sans">The Playheads</h1>
          <div className="h-px w-12 bg-air-200 mx-auto" />
          <p className="text-xs font-mono text-air-400 uppercase tracking-widest">Return to Music</p>
        </div>

        {/* Login Form */}
        <form onSubmit={onLogin} className="w-full space-y-4 pt-4">
          {message && (
            <div className={`p-3 text-sm rounded-md text-center ${
              message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
            }`}>
              {message.text}
            </div>
          )}

          <input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full h-12 px-4 rounded-lg border border-air-200 focus:outline-none focus:border-air-900 transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-lg bg-black text-white font-medium text-sm transition-colors flex items-center justify-center gap-3 hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? 'Sending Magic Link...' : 'Sign In with Email'}
          </button>
        </form>

        <div className="absolute bottom-8 text-air-300 text-[10px] font-mono">v2.1.0</div>
      </div>
    </div>
  );
}
