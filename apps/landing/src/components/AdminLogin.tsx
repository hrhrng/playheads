import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

interface Props {
  supabaseUrl: string;
  supabaseAnonKey: string;
  onLogin: (token: string) => void;
}

export default function AdminLogin({ supabaseUrl, supabaseAnonKey, onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    if (error) {
      setStatus('error');
      setMessage(error.message);
    } else {
      setStep('otp');
      setStatus('sent');
      setMessage('Check your email for a login code.');
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    });

    if (error) {
      setStatus('error');
      setMessage(error.message);
    } else if (data.session) {
      onLogin(data.session.access_token);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-air-50 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold">Admin Login</h1>
          <p className="text-sm text-air-400">Sign in with your admin email</p>
        </div>

        {message && (
          <div className={`p-3 text-sm rounded-lg text-center ${
            status === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'
          }`}>
            {message}
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={sendMagicLink} className="space-y-3">
            <input
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full h-12 px-4 rounded-lg border border-air-200 focus:outline-none focus:border-air-900"
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full h-12 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {status === 'loading' ? 'Sending...' : 'Send Login Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="space-y-3">
            <input
              type="text"
              placeholder="Enter 6-digit code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
              className="w-full h-12 px-4 rounded-lg border border-air-200 focus:outline-none focus:border-air-900 text-center font-mono text-lg tracking-widest"
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full h-12 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {status === 'loading' ? 'Verifying...' : 'Verify'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
