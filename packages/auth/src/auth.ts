/**
 * better-auth server factory.
 * Creates an auth instance per request with the given Drizzle DB.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';

export interface AuthEnv {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string; // comma-separated list of allowed origins
  RESEND_API_KEY?: string;
  // Apple Sign In (web)
  APPLE_CLIENT_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  // Google Sign In
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

async function sendEmailViaResend(
  apiKey: string,
  to: string,
  subject: string,
  html: string,
) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'The Playheads <auth@playheads.ai>',
      to,
      subject,
      html,
    }),
  });
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

  const plugins = [];

  if (env.RESEND_API_KEY) {
    const resendKey = env.RESEND_API_KEY;
    plugins.push(
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await sendEmailViaResend(
            resendKey,
            email,
            'Sign in to The Playheads',
            `<p>Click the link below to sign in:</p><p><a href="${url}">Sign in to The Playheads</a></p><p>This link expires in 5 minutes.</p>`,
          );
        },
      }),
    );
  }

  return betterAuth({
    database: drizzleAdapter(db, { provider: 'sqlite' }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins,
    emailAndPassword: { enabled: true },
    socialProviders,
    plugins,
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
