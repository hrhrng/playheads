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
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

export function createAuth(db: Parameters<typeof drizzleAdapter>[0], env: AuthEnv) {
  const trustedOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS
    ? env.BETTER_AUTH_TRUSTED_ORIGINS.split(',').map(o => o.trim())
    : [];

  return betterAuth({
    database: drizzleAdapter(db, { provider: 'sqlite' }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins,
    emailAndPassword: { enabled: true },
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
