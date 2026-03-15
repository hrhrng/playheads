/**
 * TDD tests for gateway routing with better-auth integration.
 *
 * Tests routing logic (hasSessionCookie, /api/auth/*, /api/profile/*).
 * Service bindings (WEB, LANDING, BACKEND, ADMIN) are mocked.
 */
import { describe, it, expect, vi } from 'vitest';
import { hasSessionCookie } from '../session';

// ============================================================
// Session cookie detection
// ============================================================

describe('hasSessionCookie', () => {
  it('returns true for better-auth session cookie', () => {
    const req = new Request('http://localhost/', {
      headers: { cookie: 'better-auth.session_token=abc123' },
    });
    expect(hasSessionCookie(req)).toBe(true);
  });

  it('returns false for old Supabase cookie', () => {
    const req = new Request('http://localhost/', {
      headers: { cookie: 'sb-xyz-auth-token=abc123' },
    });
    expect(hasSessionCookie(req)).toBe(false);
  });

  it('returns false when no cookie', () => {
    const req = new Request('http://localhost/');
    expect(hasSessionCookie(req)).toBe(false);
  });

  it('returns false for unrelated cookies', () => {
    const req = new Request('http://localhost/', {
      headers: { cookie: 'theme=dark; lang=en' },
    });
    expect(hasSessionCookie(req)).toBe(false);
  });
});
