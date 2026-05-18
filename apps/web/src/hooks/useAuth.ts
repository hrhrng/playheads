import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { createClient } from '@playheads/auth/src/client';

const authClient = createClient('/api/auth');
const LINKED_KEY = 'playheads_account_linked_notified';

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
  const [isSessionLoading, setIsSessionLoading] = useState(true);
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

        // Check if accounts were linked (multiple providers)
        authClient.listAccounts().then(({ data: accountsData }) => {
          const accounts = (accountsData as unknown as { id: string; provider: string }[]) || [];
          if (accounts.length > 1) {
            const notifiedProviders = localStorage.getItem(LINKED_KEY) || '';
            const providerNames = accounts.map(a => a.provider).sort().join(',');
            if (notifiedProviders !== providerNames) {
              localStorage.setItem(LINKED_KEY, providerNames);
              const names = accounts.map(a =>
                a.provider === 'credential' ? 'Email' :
                a.provider.charAt(0).toUpperCase() + a.provider.slice(1)
              ).join(' + ');
              toast.info('Accounts linked', {
                description: `Your ${names} accounts are connected under ${u.email}.`,
                duration: 6000,
              });
            }
          }
        }).catch(() => {});
      }
      setIsSessionLoading(false);
    }).catch(() => {
      setIsSessionLoading(false);
    });
  }, []);

  const handleLogin = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setAuthMessage(null);

    // Preserve ?q= query param across auth redirect
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) localStorage.setItem('playheads_pending_query', q);

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
    isSessionLoading,
    isDev,
    email,
    setEmail,
    loading,
    authMessage,
    handleLogin,
    logout,
  };
}
