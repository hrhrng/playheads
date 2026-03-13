import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth } from '../useAuth';

// Mock supabase
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSignInWithOtp = vi.fn();
const mockSignOut = vi.fn();

vi.mock('../../utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb: unknown) => mockOnAuthStateChange(cb),
      signInWithOtp: (opts: unknown) => mockSignInWithOtp(opts),
      signOut: () => mockSignOut(),
    },
  },
}));

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it('starts with null session', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.session).toBeNull();
    expect(result.current.isLoggedIn).toBe(false);
  });

  it('updates session when supabase returns one', async () => {
    const fakeSession = {
      access_token: 'tok',
      refresh_token: 'ref',
      expires_in: 3600,
      token_type: 'bearer',
      user: { id: 'u1', email: 'a@b.com' },
    };
    mockGetSession.mockResolvedValue({ data: { session: fakeSession } });

    const { result } = renderHook(() => useAuth());

    // Wait for the async getSession to resolve
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    expect(result.current.session).toEqual(fakeSession);
    expect(result.current.isLoggedIn).toBe(true);
  });

  it('handleLogin calls signInWithOtp and sets success message', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      result.current.setEmail('test@example.com');
    });

    await act(async () => {
      const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>;
      await result.current.handleLogin(fakeEvent);
    });

    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'test@example.com',
      options: { emailRedirectTo: expect.any(String) },
    });
    expect(result.current.authMessage?.type).toBe('success');
    expect(result.current.loading).toBe(false);
  });

  it('handleLogin sets error message on failure', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: { message: 'Rate limited' } });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      result.current.setEmail('test@example.com');
    });

    await act(async () => {
      const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>;
      await result.current.handleLogin(fakeEvent);
    });

    expect(result.current.authMessage).toEqual({ type: 'error', text: 'Rate limited' });
  });

  it('provides a logout function', () => {
    const { result } = renderHook(() => useAuth());
    result.current.logout();
    expect(mockSignOut).toHaveBeenCalled();
  });
});
