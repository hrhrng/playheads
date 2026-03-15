/**
 * Drizzle schema for D1 database.
 * Includes better-auth managed tables + custom app tables.
 *
 * better-auth tables use mode:'timestamp' (Date objects).
 * Custom tables use mode:'number' (raw epoch ms integers).
 */
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ============================================================
// better-auth managed tables (use Date objects via mode:'timestamp')
// ============================================================

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
  // Custom field
  waitlistApproved: integer('waitlistApproved', { mode: 'boolean' }).notNull().default(false),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => user.id),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }),
});

// ============================================================
// Custom app tables (use raw integers via mode:'number')
// ============================================================

export const waitlist = sqliteTable('waitlist', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  status: text('status').notNull().default('pending'),
  note: text('note'),
  approvedAt: integer('approvedAt', { mode: 'number' }),
  approvedBy: text('approvedBy'),
  createdAt: integer('createdAt', { mode: 'number' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'number' }).notNull(),
});

export const waitlistConfig = sqliteTable('waitlistConfig', {
  id: integer('id').primaryKey().default(1),
  autoApproveEnabled: integer('autoApproveEnabled', { mode: 'boolean' }).notNull().default(false),
  autoApprovePerDay: integer('autoApprovePerDay').notNull().default(0),
  autoApprovedToday: integer('autoApprovedToday').notNull().default(0),
  lastResetDate: text('lastResetDate'),
  updatedAt: integer('updatedAt', { mode: 'number' }).notNull(),
});

export const profile = sqliteTable('profile', {
  id: text('id').primaryKey().references(() => user.id),
  displayName: text('displayName'),
  avatarUrl: text('avatarUrl'),
  appleMusicToken: text('appleMusicToken'),
  createdAt: integer('createdAt', { mode: 'number' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'number' }).notNull(),
});

export const conversation = sqliteTable('conversation', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id),
  title: text('title'),
  messageCount: integer('messageCount').notNull().default(0),
  lastMessagePreview: text('lastMessagePreview'),
  lastMessageAt: integer('lastMessageAt', { mode: 'number' }),
  isPinned: integer('isPinned', { mode: 'boolean' }).notNull().default(false),
  isArchived: integer('isArchived', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('createdAt', { mode: 'number' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'number' }).notNull(),
});

export const conversationState = sqliteTable('conversationState', {
  id: text('id').primaryKey(),
  conversationId: text('conversationId').notNull().references(() => conversation.id),
  messages: text('messages').notNull().default('[]'),
  context: text('context').notNull().default('{}'),
  createdAt: integer('createdAt', { mode: 'number' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'number' }).notNull(),
});
