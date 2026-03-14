import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import type { SupabaseSession } from '../types';

interface AuthMessage {
  type: 'error' | 'success';
  text: string;
}

export function useAuth() {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<AuthMessage | null>(null);

  // Dev mode: skip auth with ?dev=1
  const isDev = import.meta.env.DEV && new URLSearchParams(window.location.search).has('dev');
  const devSession: SupabaseSession = {
    access_token: 'dev',
    refresh_token: 'dev',
    expires_in: 99999,
    token_type: 'bearer',
    user: { id: 'dev-user', email: 'dev@playhead.local' },
  };
  const effectiveSession = isDev ? devSession : session;
  const isLoggedIn = !!effectiveSession;

  useEffect(() => {
    console.log('[auth] init, hash:', window.location.hash ? window.location.hash.substring(0, 50) + '...' : '(none)');
    console.log('[auth] href:', window.location.href);

    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[auth] getSession result:', session ? `token=${session.access_token?.substring(0, 20)}...` : 'null');
      setSession(session as SupabaseSession | null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[auth] onAuthStateChange:', event, session ? 'has session' : 'no session');
      setSession(session as SupabaseSession | null);
    });

    return () => subscription.unsubscribe();
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
        // Not approved — don't send magic link
        setAuthMessage({ type: 'success', text: data.message || "You're on the list! We'll notify you when it's your turn." });
        setLoading(false);
        return;
      }
    } catch {
      // Waitlist check failed — proceed with login anyway
    }

    // Approved (or waitlist check failed) — send magic link
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });

    if (error) {
      setAuthMessage({ type: 'error', text: error.message });
    } else {
      setAuthMessage({ type: 'success', text: 'Check your email for the login link!' });
    }
    setLoading(false);
  }, [email]);

  const logout = useCallback(() => {
    supabase.auth.signOut();
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
