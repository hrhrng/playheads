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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session as SupabaseSession | null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session as SupabaseSession | null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setAuthMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
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
