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

  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  const handleLogin = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setAuthMessage(null);

    if (password) {
      // Email + Password auth
      const fn = authMode === 'signup'
        ? supabase.auth.signUp({ email, password })
        : supabase.auth.signInWithPassword({ email, password });

      const { error } = await fn;
      if (error) {
        setAuthMessage({ type: 'error', text: error.message });
      } else if (authMode === 'signup') {
        setAuthMessage({ type: 'success', text: 'Account created! Check your email to confirm.' });
      }
    } else {
      // Magic Link (no password)
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });

      if (error) {
        setAuthMessage({ type: 'error', text: error.message });
      } else {
        setAuthMessage({ type: 'success', text: 'Check your email for the login link!' });
      }
    }
    setLoading(false);
  }, [email, password, authMode]);

  const handleResetPassword = useCallback(async () => {
    if (!email) {
      setAuthMessage({ type: 'error', text: 'Please enter your email first' });
      return;
    }
    setLoading(true);
    setAuthMessage(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setAuthMessage({ type: 'error', text: error.message });
    } else {
      setAuthMessage({ type: 'success', text: 'Check your email for the password reset link!' });
    }
    setLoading(false);
  }, [email]);

  const handleGoogleLogin = useCallback(async () => {
    setLoading(true);
    setAuthMessage(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });

    if (error) {
      setAuthMessage({ type: 'error', text: error.message });
      setLoading(false);
    }
    // On success, browser redirects to Google — no need to setLoading(false)
  }, []);

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
    password,
    setPassword,
    authMode,
    setAuthMode,
    loading,
    authMessage,
    handleLogin,
    handleResetPassword,
    handleGoogleLogin,
    logout,
  };
}
