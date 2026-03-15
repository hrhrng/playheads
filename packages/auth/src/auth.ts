/**
 * better-auth server factory.
 * Creates an auth instance per request with the given Drizzle DB.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import * as schema from './schema';

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

/**
 * Generate Apple client secret JWT from private key.
 * Apple requires a JWT signed with ES256, valid up to 6 months.
 */
async function generateAppleClientSecret(
  teamId: string,
  clientId: string,
  keyId: string,
  privateKeyPem: string,
): Promise<string> {
  // Parse PEM to raw key bytes
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  // Import as ECDSA P-256 signing key
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  // Build JWT
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 86400 * 180; // 6 months

  const header = { alg: 'ES256', kid: keyId };
  const payload = {
    iss: teamId,
    iat: now,
    exp,
    aud: 'https://appleid.apple.com',
    sub: clientId,
  };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );

  // Convert DER signature to raw r||s format for JWT
  const sigBytes = new Uint8Array(signature);
  let sigB64: string;

  if (sigBytes.length === 64) {
    // Already raw r||s
    sigB64 = btoa(String.fromCharCode(...sigBytes))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  } else {
    // DER encoded — Web Crypto on some platforms returns DER
    // Parse DER: 0x30 <len> 0x02 <rlen> <r> 0x02 <slen> <s>
    let offset = 2; // skip 0x30 <len>
    if (sigBytes[1] & 0x80) offset += (sigBytes[1] & 0x7f);
    offset += 1; // 0x02
    const rLen = sigBytes[offset++];
    const r = sigBytes.slice(offset, offset + rLen);
    offset += rLen + 1; // skip r + 0x02
    const sLen = sigBytes[offset++];
    const s = sigBytes.slice(offset, offset + sLen);

    // Pad/trim to 32 bytes each
    const pad = (b: Uint8Array) => {
      if (b.length === 32) return b;
      if (b.length > 32) return b.slice(b.length - 32);
      const padded = new Uint8Array(32);
      padded.set(b, 32 - b.length);
      return padded;
    };

    const raw = new Uint8Array(64);
    raw.set(pad(r), 0);
    raw.set(pad(s), 32);
    sigB64 = btoa(String.fromCharCode(...raw))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  return `${signingInput}.${sigB64}`;
}

// Cache the generated Apple client secret (valid for 6 months)
let _appleClientSecret: string | null = null;

export function createAuth(db: Parameters<typeof drizzleAdapter>[0], env: AuthEnv) {
  const trustedOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS
    ? env.BETTER_AUTH_TRUSTED_ORIGINS.split(',').map(o => o.trim())
    : [];

  // Always trust Apple's domain for Sign in with Apple
  trustedOrigins.push('https://appleid.apple.com');

  const socialProviders: Record<string, unknown> = {};

  if (env.APPLE_CLIENT_ID && env.APPLE_PRIVATE_KEY && env.APPLE_KEY_ID && env.APPLE_TEAM_ID) {
    // Generate client secret synchronously from cache, or lazily
    // For the first request, we generate it inline
    const clientId = env.APPLE_CLIENT_ID;
    const keyId = env.APPLE_KEY_ID;
    const teamId = env.APPLE_TEAM_ID;
    const privateKey = env.APPLE_PRIVATE_KEY;

    // Use a getter to lazily generate the secret
    socialProviders.apple = {
      clientId,
      // clientSecret will be set after async generation
      clientSecret: 'placeholder',
      appBundleIdentifier: clientId,
    };

    // Generate secret synchronously if cached
    if (!_appleClientSecret) {
      // We need to generate it — but betterAuth is sync.
      // Use a top-level await workaround: generate before creating auth.
      // For now, we'll use the module-level cache approach.
    }
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

  // Extract root domain for cross-subdomain cookies
  const rootDomain = env.BETTER_AUTH_URL
    ? new URL(env.BETTER_AUTH_URL).hostname.split('.').slice(-2).join('.')
    : undefined;

  return betterAuth({
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins,
    emailAndPassword: { enabled: true },
    socialProviders,
    plugins,
    advanced: {
      crossSubDomainCookies: rootDomain
        ? { enabled: true, domain: `.${rootDomain}` }
        : undefined,
    },
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

/**
 * Async version: generate Apple client secret then create auth.
 * Use this in the gateway handler instead of createAuth directly.
 */
export async function createAuthWithApple(db: Parameters<typeof drizzleAdapter>[0], env: AuthEnv) {
  if (env.APPLE_CLIENT_ID && env.APPLE_PRIVATE_KEY && env.APPLE_KEY_ID && env.APPLE_TEAM_ID) {
    if (!_appleClientSecret) {
      _appleClientSecret = await generateAppleClientSecret(
        env.APPLE_TEAM_ID,
        env.APPLE_CLIENT_ID,
        env.APPLE_KEY_ID,
        env.APPLE_PRIVATE_KEY,
      );
    }
    // Patch env to use the generated JWT
    env = { ...env, APPLE_PRIVATE_KEY: _appleClientSecret };
  }

  const trustedOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS
    ? env.BETTER_AUTH_TRUSTED_ORIGINS.split(',').map(o => o.trim())
    : [];
  trustedOrigins.push('https://appleid.apple.com');

  const socialProviders: Record<string, unknown> = {};

  if (env.APPLE_CLIENT_ID && _appleClientSecret) {
    socialProviders.apple = {
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: _appleClientSecret,
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

  // Extract root domain for cross-subdomain cookies
  const rootDomain = env.BETTER_AUTH_URL
    ? new URL(env.BETTER_AUTH_URL).hostname.split('.').slice(-2).join('.')
    : undefined;

  return betterAuth({
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins,
    emailAndPassword: { enabled: true },
    socialProviders,
    plugins,
    advanced: {
      crossSubDomainCookies: rootDomain
        ? { enabled: true, domain: `.${rootDomain}` }
        : undefined,
    },
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
