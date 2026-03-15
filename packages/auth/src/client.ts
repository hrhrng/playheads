/**
 * better-auth React client.
 * Used by the web app for auth state and sign-in/out methods.
 */
import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

export function createClient(baseURL = '/api/auth') {
  return createAuthClient({
    baseURL,
    plugins: [magicLinkClient()],
  });
}
