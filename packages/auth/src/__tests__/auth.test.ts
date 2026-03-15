/**
 * TDD tests for better-auth server factory.
 */
import { describe, it, expect } from 'vitest';
import { createAuthWithApple } from '../auth';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema';

function createTestDb() {
  const sqlite = new Database(':memory:');
  // Create tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "user" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "email" text NOT NULL UNIQUE,
      "emailVerified" integer NOT NULL DEFAULT 0,
      "image" text,
      "createdAt" integer NOT NULL,
      "updatedAt" integer NOT NULL,
      "waitlistApproved" integer NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS "session" (
      "id" text PRIMARY KEY NOT NULL,
      "expiresAt" integer NOT NULL,
      "token" text NOT NULL UNIQUE,
      "createdAt" integer NOT NULL,
      "updatedAt" integer NOT NULL,
      "ipAddress" text,
      "userAgent" text,
      "userId" text NOT NULL REFERENCES "user"("id")
    );
    CREATE TABLE IF NOT EXISTS "account" (
      "id" text PRIMARY KEY NOT NULL,
      "accountId" text NOT NULL,
      "providerId" text NOT NULL,
      "userId" text NOT NULL REFERENCES "user"("id"),
      "accessToken" text,
      "refreshToken" text,
      "idToken" text,
      "accessTokenExpiresAt" integer,
      "refreshTokenExpiresAt" integer,
      "scope" text,
      "password" text,
      "createdAt" integer NOT NULL,
      "updatedAt" integer NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "verification" (
      "id" text PRIMARY KEY NOT NULL,
      "identifier" text NOT NULL,
      "value" text NOT NULL,
      "expiresAt" integer NOT NULL,
      "createdAt" integer,
      "updatedAt" integer
    );
  `);
  return drizzle(sqlite, { schema });
}

describe('createAuthWithApple', () => {
  it('returns an auth instance with handler method', async () => {
    const db = createTestDb();
    const auth = await createAuthWithApple(db, {
      BETTER_AUTH_SECRET: 'test-secret-at-least-32-chars-long!!',
      BETTER_AUTH_URL: 'http://localhost:8787',
    });

    expect(auth).toBeDefined();
    expect(auth.handler).toBeTypeOf('function');
  });

  it('auth handler responds to GET /api/auth/ok', async () => {
    const db = createTestDb();
    const auth = await createAuthWithApple(db, {
      BETTER_AUTH_SECRET: 'test-secret-at-least-32-chars-long!!',
      BETTER_AUTH_URL: 'http://localhost:8787',
    });

    const request = new Request('http://localhost:8787/api/auth/ok');
    const response = await auth.handler(request);

    expect(response.status).toBe(200);
  });

  it('auth handler responds to POST /api/auth/sign-up/email', async () => {
    const db = createTestDb();
    const auth = await createAuthWithApple(db, {
      BETTER_AUTH_SECRET: 'test-secret-at-least-32-chars-long!!',
      BETTER_AUTH_URL: 'http://localhost:8787',
    });

    const request = new Request('http://localhost:8787/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        email: 'test@example.com',
        password: 'testpassword123',
      }),
    });

    const response = await auth.handler(request);
    // Should succeed (201 or 200) - user created
    expect(response.status).toBeLessThan(400);
  });
});
