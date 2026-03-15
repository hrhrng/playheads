import { createClient } from '@playheads/auth/src/client';

const authClient = createClient('/api/auth');

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
  const handleSocialLogin = async (provider: 'apple' | 'google') => {
    await authClient.signIn.social({
      provider,
      callbackURL: window.location.origin,
    });
  };

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
        <div className="w-full space-y-4 pt-4">
          {message && (
            <div className={`p-3 text-sm rounded-md text-center ${
              message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
            }`}>
              {message.text}
            </div>
          )}

          {/* Email Magic Link */}
          <form onSubmit={onLogin} className="space-y-3">
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

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-air-200" />
            <span className="text-xs text-air-400 font-mono">or</span>
            <div className="flex-1 h-px bg-air-200" />
          </div>

          {/* Social Login Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => handleSocialLogin('apple')}
              className="w-full h-12 rounded-lg bg-black text-white font-medium text-sm transition-colors flex items-center justify-center gap-3 hover:bg-gray-800"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              Continue with Apple
            </button>

            <button
              onClick={() => handleSocialLogin('google')}
              className="w-full h-12 rounded-lg bg-white text-air-900 font-medium text-sm border border-air-200 transition-colors flex items-center justify-center gap-3 hover:bg-air-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          </div>
        </div>

        <div className="absolute bottom-8 text-air-300 text-[10px] font-mono">v3.0.0</div>
      </div>
    </div>
  );
}
