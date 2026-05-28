/**
 * better-auth server factory.
 * Creates an auth instance per request with the given Drizzle DB.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

export interface AuthEnv {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  RESEND_API_KEY?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  /** Comma-separated list of iOS bundle identifiers whose native SIWA
   *  identity tokens should validate against this provider. Required for
   *  native id-token sign-in; leave unset to serve web OAuth only. */
  APPLE_APP_BUNDLE_IDENTIFIER?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

async function sendEmailViaResend(
  apiKey: string,
  to: string,
  subject: string,
  html: string,
) {
  const res = await fetch('https://api.resend.com/emails', {
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
  // Resend returns 4xx for unverified domains, sandbox recipient
  // restrictions ("you can only send to your own address"), bad keys,
  // rate limits, etc. Swallowing those left the client showing
  // "check your email" while nothing was sent — surface it instead so
  // better-auth returns an error and the failure shows in gateway logs.
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[auth] Resend send failed', { status: res.status, to, detail: detail.slice(0, 500) });
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
  }
}

/**
 * Generate Apple client secret JWT from private key.
 */
async function generateAppleClientSecret(
  teamId: string,
  clientId: string,
  keyId: string,
  privateKeyPem: string,
): Promise<string> {
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 86400 * 180;

  const header = { alg: 'ES256', kid: keyId };
  const payload = { iss: teamId, iat: now, exp, aud: 'https://appleid.apple.com', sub: clientId };

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

  const sigBytes = new Uint8Array(signature);
  let sigB64: string;

  if (sigBytes.length === 64) {
    sigB64 = btoa(String.fromCharCode(...sigBytes))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  } else {
    let offset = 2;
    if (sigBytes[1] & 0x80) offset += (sigBytes[1] & 0x7f);
    offset += 1;
    const rLen = sigBytes[offset++];
    const r = sigBytes.slice(offset, offset + rLen);
    offset += rLen + 1;
    const sLen = sigBytes[offset++];
    const s = sigBytes.slice(offset, offset + sLen);

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

let _appleClientSecret: string | null = null;

/**
 * Create better-auth instance. Use this for all auth operations.
 * Generates Apple client secret JWT on first call (async).
 */
export async function createAuthWithApple(db: Parameters<typeof drizzleAdapter>[0], env: AuthEnv) {
  // Generate Apple client secret JWT if needed
  if (env.APPLE_CLIENT_ID && env.APPLE_PRIVATE_KEY && env.APPLE_KEY_ID && env.APPLE_TEAM_ID) {
    if (!_appleClientSecret) {
      _appleClientSecret = await generateAppleClientSecret(
        env.APPLE_TEAM_ID, env.APPLE_CLIENT_ID, env.APPLE_KEY_ID, env.APPLE_PRIVATE_KEY,
      );
    }
  }

  // Trusted origins
  const trustedOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS
    ? env.BETTER_AUTH_TRUSTED_ORIGINS.split(',').map(o => o.trim())
    : [];
  trustedOrigins.push('https://appleid.apple.com');

  // Social providers
  const socialProviders: Record<string, unknown> = {};

  if (env.APPLE_CLIENT_ID && _appleClientSecret) {
    // Web OAuth flow validates `aud === clientId` (the Services ID). Native
    // iOS SIWA issues tokens whose `aud` is the app bundle identifier, so we
    // must explicitly declare which bundles to trust. No fallback default —
    // silently trusting a hard-coded id would widen the trust boundary if
    // this project is forked or redeployed. If the env isn't set, native
    // id-token sign-in returns 400; web OAuth keeps working.
    const bundleIds = env.APPLE_APP_BUNDLE_IDENTIFIER
      ? env.APPLE_APP_BUNDLE_IDENTIFIER.split(",").map(s => s.trim()).filter(Boolean)
      : [];
    socialProviders.apple = {
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: _appleClientSecret,
      ...(bundleIds.length === 1
        ? { appBundleIdentifier: bundleIds[0] }
        : bundleIds.length > 1
          ? { appBundleIdentifier: bundleIds }
          : {}),
    };
  }

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }

  // Plugins
  const plugins = [];
  if (env.RESEND_API_KEY) {
    const resendKey = env.RESEND_API_KEY;
    plugins.push(
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await sendEmailViaResend(
            resendKey, email,
            'Sign in to The Playheads',
            `<p>Click the link below to sign in:</p><p><a href="${url}">Sign in to The Playheads</a></p><p>This link expires in 5 minutes.</p>`,
          );
        },
      }),
    );
  }

  // Cross-subdomain cookies
  const rootDomain = env.BETTER_AUTH_URL
    ? new URL(env.BETTER_AUTH_URL).hostname.split('.').slice(-2).join('.')
    : undefined;

  const adapter = drizzleAdapter(db, { provider: 'sqlite', schema });

  return betterAuth({
    database: adapter,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins,
    emailAndPassword: { enabled: true },
    socialProviders,
    plugins,
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'apple', 'email'],
      },
    },
    advanced: {
      crossSubDomainCookies: rootDomain
        ? { enabled: true, domain: `.${rootDomain}` }
        : undefined,
    },
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            // On every login: ensure waitlist entry exists + sync approval to user
            try {
              const [user] = await db
                .select({ email: schema.user.email, waitlistApproved: schema.user.waitlistApproved })
                .from(schema.user)
                .where(eq(schema.user.id, session.userId));
              if (!user) return;

              const now = Date.now();

              // Ensure waitlist entry exists
              await db.insert(schema.waitlist).values({
                id: crypto.randomUUID(),
                email: user.email,
                status: 'pending',
                createdAt: now,
                updatedAt: now,
              }).onConflictDoNothing();

              // If waitlist is approved but user.waitlistApproved is false, sync it
              if (!user.waitlistApproved) {
                const [wl] = await db
                  .select({ status: schema.waitlist.status })
                  .from(schema.waitlist)
                  .where(eq(schema.waitlist.email, user.email));
                if (wl?.status === 'approved') {
                  await db.update(schema.user)
                    .set({ waitlistApproved: true })
                    .where(eq(schema.user.id, session.userId));
                }
              }
            } catch {
              // Ignore — waitlist entry may already exist
            }
          },
        },
      },
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

/** @deprecated Use createAuthWithApple instead */
export const createAuth = createAuthWithApple;
