import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@playheads/auth/src/client';

const authClient = createClient('/api/auth');

export interface AuthSession {
  user: {
    id: string;
    email: string;
    name: string;
    waitlistApproved?: boolean;
  };
}

interface AuthMessage {
  type: 'error' | 'success';
  text: string;
}

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<AuthMessage | null>(null);

  // Dev mode: skip auth with ?dev=1
  const isDev = import.meta.env.DEV && new URLSearchParams(window.location.search).has('dev');
  const devSession: AuthSession = {
    user: { id: 'dev-user', email: 'dev@playhead.local', name: 'Dev User', waitlistApproved: true },
  };
  const effectiveSession = isDev ? devSession : session;
  const isLoggedIn = !!effectiveSession;

  // Check existing session on mount
  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (data?.user) {
        const u = data.user as Record<string, unknown>;
        setSession({
          user: {
            id: u.id as string,
            email: u.email as string,
            name: u.name as string,
            waitlistApproved: u.waitlistApproved as boolean | undefined,
          },
        });
      }
    }).catch(() => {});
  }, []);

  const handleLogin = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setAuthMessage(null);

    try {
      // Check waitlist status first (idempotent — adds if not exists)
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (res.ok && data.status !== 'approved') {
        setAuthMessage({ type: 'success', text: data.message || "You're on the list! We'll notify you when it's your turn." });
        setLoading(false);
        return;
      }
    } catch {
      // Waitlist check failed — proceed with login anyway
    }

    // Send magic link
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: window.location.origin + window.location.pathname,
    });

    if (error) {
      setAuthMessage({ type: 'error', text: error.message || 'Failed to send magic link' });
    } else {
      setAuthMessage({ type: 'success', text: 'Check your email for the login link!' });
    }
    setLoading(false);
  }, [email]);

  const logout = useCallback(async () => {
    await authClient.signOut();
    setSession(null);
  }, []);

  return {
    session,
    effectiveSession,
    isLoggedIn,
    isDev,
    email,
    setEmail,
    loading,
    authMessage,
    handleLogin,
    logout,
  };
}
