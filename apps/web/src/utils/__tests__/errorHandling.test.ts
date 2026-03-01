/**
 * Tests for classifyError() — the central error classification utility.
 *
 * Covers HTTP Response objects, Error instances, MusicKit errors,
 * structured backend errors, and the fallback UNKNOWN path.
 *
 * @module utils/__tests__/errorHandling
 */

import { describe, it, expect, vi } from 'vitest';
import { classifyError } from '../../utils/errorHandling';
import { ErrorCategory } from '../../types/errors';

// Mock sonner so importing errorHandling.ts doesn't explode
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

// ==================================================================
// Response objects (fetch error responses)
// ==================================================================

describe('classifyError — Response objects', () => {
  it('classifies 401 as AUTH_EXPIRED with reauth action', () => {
    const result = classifyError(new Response(null, { status: 401 }));
    expect(result.category).toBe(ErrorCategory.AUTH_EXPIRED);
    expect(result.action).toBe('reauth');
  });

  it('classifies 403 as AUTH_EXPIRED', () => {
    const result = classifyError(new Response(null, { status: 403 }));
    expect(result.category).toBe(ErrorCategory.AUTH_EXPIRED);
  });

  it('classifies 429 as API_ERROR and retryable', () => {
    const result = classifyError(new Response(null, { status: 429 }));
    expect(result.category).toBe(ErrorCategory.API_ERROR);
    expect(result.retryable).toBe(true);
  });

  it('classifies 500 as API_ERROR and retryable', () => {
    const result = classifyError(new Response(null, { status: 500 }));
    expect(result.category).toBe(ErrorCategory.API_ERROR);
    expect(result.retryable).toBe(true);
  });

  it('classifies 503 as API_ERROR and retryable', () => {
    const result = classifyError(new Response(null, { status: 503 }));
    expect(result.category).toBe(ErrorCategory.API_ERROR);
    expect(result.retryable).toBe(true);
  });

  it('classifies 400 as VALIDATION', () => {
    const result = classifyError(new Response(null, { status: 400 }));
    expect(result.category).toBe(ErrorCategory.VALIDATION);
    expect(result.retryable).toBe(false);
  });
});

// ==================================================================
// Error instances (thrown JS errors)
// ==================================================================

describe('classifyError — Error instances', () => {
  it('classifies "network" errors as NETWORK and retryable', () => {
    const result = classifyError(new Error('network timeout'));
    expect(result.category).toBe(ErrorCategory.NETWORK);
    expect(result.retryable).toBe(true);
  });

  it('classifies "fetch" errors as NETWORK', () => {
    const result = classifyError(new Error('Failed to fetch'));
    expect(result.category).toBe(ErrorCategory.NETWORK);
  });

  it('classifies "unauthorized" errors as AUTH_EXPIRED', () => {
    const result = classifyError(new Error('unauthorized access'));
    expect(result.category).toBe(ErrorCategory.AUTH_EXPIRED);
    expect(result.action).toBe('reauth');
  });

  it('classifies "permission" errors as PERMISSION', () => {
    const result = classifyError(new Error('permission denied'));
    expect(result.category).toBe(ErrorCategory.PERMISSION);
  });

  it('classifies "forbidden" errors as PERMISSION', () => {
    const result = classifyError(new Error('action forbidden'));
    expect(result.category).toBe(ErrorCategory.PERMISSION);
  });

  it('falls through to UNKNOWN for unrecognized Error messages', () => {
    const result = classifyError(new Error('something weird happened'));
    expect(result.category).toBe(ErrorCategory.UNKNOWN);
    expect(result.message).toBe('something weird happened');
  });
});

// ==================================================================
// MusicKit error objects
// ==================================================================

describe('classifyError — MusicKit errors', () => {
  it('classifies {isAuthorized: false} as AUTH_EXPIRED', () => {
    const result = classifyError({ isAuthorized: false });
    expect(result.category).toBe(ErrorCategory.AUTH_EXPIRED);
    expect(result.action).toBe('reauth');
  });

  it('classifies {code: "AUTHORIZATION_ERROR"} as AUTH_EXPIRED', () => {
    const result = classifyError({ code: 'AUTHORIZATION_ERROR' });
    expect(result.category).toBe(ErrorCategory.AUTH_EXPIRED);
  });

  it('classifies {code: "NETWORK_ERROR"} as NETWORK and retryable', () => {
    const result = classifyError({ code: 'NETWORK_ERROR' });
    expect(result.category).toBe(ErrorCategory.NETWORK);
    expect(result.retryable).toBe(true);
  });
});

// ==================================================================
// Structured backend errors
// ==================================================================

describe('classifyError — structured backend errors', () => {
  it('maps AUTH_TOKEN_INVALID to AUTH_EXPIRED', () => {
    const result = classifyError({ error: 'AUTH_TOKEN_INVALID', status: 401 });
    expect(result.category).toBe(ErrorCategory.AUTH_EXPIRED);
  });

  it('maps AUTH_TOKEN_EXPIRED to AUTH_EXPIRED', () => {
    const result = classifyError({ error: 'AUTH_TOKEN_EXPIRED', status: 401 });
    expect(result.category).toBe(ErrorCategory.AUTH_EXPIRED);
  });

  it('maps RATE_LIMIT to API_ERROR', () => {
    const result = classifyError({ error: 'RATE_LIMIT', status: 429 });
    expect(result.category).toBe(ErrorCategory.API_ERROR);
  });

  it('maps SERVICE_UNAVAILABLE to API_ERROR', () => {
    const result = classifyError({ error: 'SERVICE_UNAVAILABLE', status: 503 });
    expect(result.category).toBe(ErrorCategory.API_ERROR);
  });

  it('maps PERMISSION_DENIED to PERMISSION', () => {
    const result = classifyError({ error: 'PERMISSION_DENIED', status: 403 });
    expect(result.category).toBe(ErrorCategory.PERMISSION);
  });

  it('maps VALIDATION_ERROR to VALIDATION', () => {
    const result = classifyError({ error: 'VALIDATION_ERROR', status: 400 });
    expect(result.category).toBe(ErrorCategory.VALIDATION);
  });

  it('falls back to UNKNOWN for unrecognized error codes', () => {
    const result = classifyError({ error: 'COSMIC_RAY', status: 999 });
    expect(result.category).toBe(ErrorCategory.UNKNOWN);
  });

  it('preserves custom message from structured error', () => {
    const result = classifyError({
      error: 'RATE_LIMIT',
      status: 429,
      message: 'Slow down!',
    });
    expect(result.message).toBe('Slow down!');
  });
});

// ==================================================================
// Fallback / unknown
// ==================================================================

describe('classifyError — unknown errors', () => {
  it('classifies null as UNKNOWN', () => {
    const result = classifyError(null);
    expect(result.category).toBe(ErrorCategory.UNKNOWN);
  });

  it('classifies undefined as UNKNOWN', () => {
    const result = classifyError(undefined);
    expect(result.category).toBe(ErrorCategory.UNKNOWN);
  });

  it('classifies a plain string as UNKNOWN', () => {
    const result = classifyError('oops');
    expect(result.category).toBe(ErrorCategory.UNKNOWN);
  });

  it('classifies a number as UNKNOWN', () => {
    const result = classifyError(42);
    expect(result.category).toBe(ErrorCategory.UNKNOWN);
  });
});
