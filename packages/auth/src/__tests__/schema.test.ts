/**
 * TDD tests for D1 Drizzle schema.
 * Uses better-sqlite3 locally (D1 is SQLite under the hood).
 *
 * better-auth tables use Date objects (mode:'timestamp').
 * Custom tables use raw numbers (mode:'number').
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import * as schema from '../schema';

function createTestDb() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });

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
    CREATE TABLE IF NOT EXISTS "waitlist" (
      "id" text PRIMARY KEY NOT NULL,
      "email" text NOT NULL UNIQUE,
      "status" text NOT NULL DEFAULT 'pending',
      "note" text,
      "approvedAt" integer,
      "approvedBy" text,
      "createdAt" integer NOT NULL,
      "updatedAt" integer NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "waitlistConfig" (
      "id" integer PRIMARY KEY NOT NULL DEFAULT 1,
      "autoApproveEnabled" integer NOT NULL DEFAULT 0,
      "autoApprovePerDay" integer NOT NULL DEFAULT 0,
      "autoApprovedToday" integer NOT NULL DEFAULT 0,
      "lastResetDate" text,
      "updatedAt" integer NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "profile" (
      "id" text PRIMARY KEY NOT NULL REFERENCES "user"("id"),
      "displayName" text,
      "avatarUrl" text,
      "appleMusicToken" text,
      "createdAt" integer NOT NULL,
      "updatedAt" integer NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "conversation" (
      "id" text PRIMARY KEY NOT NULL,
      "userId" text NOT NULL REFERENCES "user"("id"),
      "title" text,
      "messageCount" integer NOT NULL DEFAULT 0,
      "lastMessagePreview" text,
      "lastMessageAt" integer,
      "isPinned" integer NOT NULL DEFAULT 0,
      "isArchived" integer NOT NULL DEFAULT 0,
      "createdAt" integer NOT NULL,
      "updatedAt" integer NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "conversationState" (
      "id" text PRIMARY KEY NOT NULL,
      "conversationId" text NOT NULL REFERENCES "conversation"("id"),
      "messages" text NOT NULL DEFAULT '[]',
      "context" text NOT NULL DEFAULT '{}',
      "createdAt" integer NOT NULL,
      "updatedAt" integer NOT NULL
    );
  `);

  return db;
}

/** Helper: insert a test user (better-auth table uses Date objects) */
function insertTestUser(db: ReturnType<typeof createTestDb>, id = 'usr_1') {
  const now = new Date();
  db.insert(schema.user).values({
    id, name: 'Test', email: `${id}@test.com`, createdAt: now, updatedAt: now,
  }).run();
}

// ============================================================
// better-auth managed tables (use Date objects)
// ============================================================

describe('Schema: user table', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it('inserts and queries a user', () => {
    const now = new Date();
    db.insert(schema.user).values({
      id: 'usr_1', name: 'Test User', email: 'test@example.com',
      createdAt: now, updatedAt: now,
    }).run();

    const users = db.select().from(schema.user).all();
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe('test@example.com');
    expect(users[0].waitlistApproved).toBe(false);
    expect(users[0].createdAt).toBeInstanceOf(Date);
  });

  it('enforces unique email', () => {
    const now = new Date();
    db.insert(schema.user).values({
      id: 'usr_1', name: 'A', email: 'dup@test.com', createdAt: now, updatedAt: now,
    }).run();

    expect(() => {
      db.insert(schema.user).values({
        id: 'usr_2', name: 'B', email: 'dup@test.com', createdAt: now, updatedAt: now,
      }).run();
    }).toThrow();
  });

  it('defaults waitlistApproved to false', () => {
    insertTestUser(db);
    const [user] = db.select().from(schema.user).all();
    expect(user.waitlistApproved).toBe(false);
  });
});

describe('Schema: session & account tables (better-auth managed)', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); insertTestUser(db); });

  it('inserts and queries session', () => {
    const now = new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    db.insert(schema.session).values({
      id: 'sess_1', userId: 'usr_1', token: 'tok_abc',
      expiresAt: expires, createdAt: now, updatedAt: now,
    }).run();

    const sessions = db.select().from(schema.session).all();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].token).toBe('tok_abc');
    expect(sessions[0].userId).toBe('usr_1');
    expect(sessions[0].expiresAt).toBeInstanceOf(Date);
  });

  it('inserts and queries account', () => {
    const now = new Date();
    db.insert(schema.account).values({
      id: 'acc_1', accountId: 'google_123', providerId: 'google', userId: 'usr_1',
      createdAt: now, updatedAt: now,
    }).run();

    const accounts = db.select().from(schema.account).all();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].providerId).toBe('google');
  });
});

// ============================================================
// Custom app tables (use raw numbers)
// ============================================================

describe('Schema: waitlist table', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it('inserts and queries waitlist entry', () => {
    const now = Date.now();
    db.insert(schema.waitlist).values({
      id: 'wl_1', email: 'wait@test.com', createdAt: now, updatedAt: now,
    }).run();

    const entries = db.select().from(schema.waitlist).all();
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('pending');
    expect(entries[0].email).toBe('wait@test.com');
  });

  it('enforces unique email', () => {
    const now = Date.now();
    db.insert(schema.waitlist).values({
      id: 'wl_1', email: 'dup@test.com', createdAt: now, updatedAt: now,
    }).run();

    expect(() => {
      db.insert(schema.waitlist).values({
        id: 'wl_2', email: 'dup@test.com', createdAt: now, updatedAt: now,
      }).run();
    }).toThrow();
  });

  it('updates status to approved', () => {
    const now = Date.now();
    db.insert(schema.waitlist).values({
      id: 'wl_1', email: 'a@test.com', createdAt: now, updatedAt: now,
    }).run();

    db.update(schema.waitlist)
      .set({ status: 'approved', approvedAt: now, approvedBy: 'admin' })
      .where(sql`${schema.waitlist.id} = 'wl_1'`)
      .run();

    const [entry] = db.select().from(schema.waitlist).all();
    expect(entry.status).toBe('approved');
    expect(entry.approvedBy).toBe('admin');
  });
});

describe('Schema: profile table', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); insertTestUser(db); });

  it('inserts and queries profile', () => {
    const now = Date.now();
    db.insert(schema.profile).values({
      id: 'usr_1', displayName: 'DJ Test', createdAt: now, updatedAt: now,
    }).run();

    const profiles = db.select().from(schema.profile).all();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].displayName).toBe('DJ Test');
    expect(profiles[0].appleMusicToken).toBeNull();
  });

  it('updates apple music token', () => {
    const now = Date.now();
    db.insert(schema.profile).values({
      id: 'usr_1', createdAt: now, updatedAt: now,
    }).run();

    db.update(schema.profile)
      .set({ appleMusicToken: 'amt_abc123', updatedAt: Date.now() })
      .where(sql`${schema.profile.id} = 'usr_1'`)
      .run();

    const [p] = db.select().from(schema.profile).all();
    expect(p.appleMusicToken).toBe('amt_abc123');
  });
});

describe('Schema: conversation table', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); insertTestUser(db); });

  it('inserts and queries conversation', () => {
    const now = Date.now();
    db.insert(schema.conversation).values({
      id: 'conv_1', userId: 'usr_1', title: 'My first chat',
      createdAt: now, updatedAt: now,
    }).run();

    const convos = db.select().from(schema.conversation).all();
    expect(convos).toHaveLength(1);
    expect(convos[0].title).toBe('My first chat');
    expect(convos[0].messageCount).toBe(0);
    expect(convos[0].isPinned).toBe(false);
    expect(convos[0].isArchived).toBe(false);
  });

  it('updates message count and preview', () => {
    const now = Date.now();
    db.insert(schema.conversation).values({
      id: 'conv_1', userId: 'usr_1', createdAt: now, updatedAt: now,
    }).run();

    db.update(schema.conversation)
      .set({ messageCount: 5, lastMessagePreview: 'Hello!', lastMessageAt: now })
      .where(sql`${schema.conversation.id} = 'conv_1'`)
      .run();

    const [c] = db.select().from(schema.conversation).all();
    expect(c.messageCount).toBe(5);
    expect(c.lastMessagePreview).toBe('Hello!');
  });
});

describe('Schema: conversationState table', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    db = createTestDb();
    insertTestUser(db);
    const now = Date.now();
    db.insert(schema.conversation).values({
      id: 'conv_1', userId: 'usr_1', createdAt: now, updatedAt: now,
    }).run();
  });

  it('stores and retrieves JSON messages', () => {
    const now = Date.now();
    const messages = JSON.stringify([{ role: 'user', content: 'Hi' }]);

    db.insert(schema.conversationState).values({
      id: 'cs_1', conversationId: 'conv_1', messages,
      createdAt: now, updatedAt: now,
    }).run();

    const [state] = db.select().from(schema.conversationState).all();
    expect(JSON.parse(state.messages)).toEqual([{ role: 'user', content: 'Hi' }]);
    expect(JSON.parse(state.context)).toEqual({});
  });
});

describe('Schema: waitlistConfig table', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it('inserts config with defaults', () => {
    const now = Date.now();
    db.insert(schema.waitlistConfig).values({ updatedAt: now }).run();

    const [config] = db.select().from(schema.waitlistConfig).all();
    expect(config.autoApproveEnabled).toBe(false);
    expect(config.autoApprovePerDay).toBe(0);
    expect(config.autoApprovedToday).toBe(0);
  });
});
