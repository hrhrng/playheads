/**
 * better-auth React client.
 * Used by the web app for auth state and sign-in/out methods.
 */
import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

export function createClient(baseURL?: string) {
  // better-auth requires a full URL, not a relative path
  const resolved = baseURL?.startsWith('http')
    ? baseURL
    : `${typeof window !== 'undefined' ? window.location.origin : 'http://localhost'}${baseURL || '/api/auth'}`;

  return createAuthClient({
    baseURL: resolved,
    plugins: [magicLinkClient()],
  });
}
