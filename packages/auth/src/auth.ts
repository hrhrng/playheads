/**
 * better-auth server factory.
 * Creates an auth instance per request with the given Drizzle DB.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

export interface AuthEnv {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string; // comma-separated list of allowed origins
  // Apple Sign In (web)
  APPLE_CLIENT_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  // Google Sign In
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

export function createAuth(db: Parameters<typeof drizzleAdapter>[0], env: AuthEnv) {
  const trustedOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS
    ? env.BETTER_AUTH_TRUSTED_ORIGINS.split(',').map(o => o.trim())
    : [];

  const socialProviders: Record<string, unknown> = {};

  if (env.APPLE_CLIENT_ID && env.APPLE_PRIVATE_KEY) {
    socialProviders.apple = {
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: env.APPLE_PRIVATE_KEY,
      appBundleIdentifier: env.APPLE_CLIENT_ID,
      keyId: env.APPLE_KEY_ID,
      teamId: env.APPLE_TEAM_ID,
    };
  }

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }

  return betterAuth({
    database: drizzleAdapter(db, { provider: 'sqlite' }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins,
    emailAndPassword: { enabled: true },
    socialProviders,
    user: {
      additionalFields: {
        waitlistApproved: {
          type: 'boolean',
          defaultValue: false,
          input: false,
        },
      },
    },
  });
}
