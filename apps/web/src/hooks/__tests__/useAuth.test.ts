import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth } from '../useAuth';

// Mock better-auth client
const mockGetSession = vi.fn();
const mockSignInMagicLink = vi.fn();
const mockSignOut = vi.fn();

vi.mock('@playheads/auth/src/client', () => ({
  createClient: () => ({
    getSession: () => mockGetSession(),
    signIn: {
      magicLink: (opts: unknown) => mockSignInMagicLink(opts),
    },
    signOut: () => mockSignOut(),
  }),
}));

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: null });
  });

  it('starts with null session', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.session).toBeNull();
    expect(result.current.isLoggedIn).toBe(false);
  });

  it('updates session when better-auth returns one', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'u1', email: 'a@b.com', name: 'Test', waitlistApproved: true },
        },
      },
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    expect(result.current.session?.user.id).toBe('u1');
    expect(result.current.isLoggedIn).toBe(true);
  });

  it('handleLogin sends magic link and sets success message', async () => {
    mockSignInMagicLink.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      result.current.setEmail('test@example.com');
    });

    await act(async () => {
      const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>;
      await result.current.handleLogin(fakeEvent);
    });

    expect(mockSignInMagicLink).toHaveBeenCalledWith({
      email: 'test@example.com',
      callbackURL: expect.any(String),
    });
    expect(result.current.authMessage?.type).toBe('success');
    expect(result.current.loading).toBe(false);
  });

  it('handleLogin sets error message on failure', async () => {
    mockSignInMagicLink.mockResolvedValue({ error: { message: 'Rate limited' } });

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

  it('provides a logout function', async () => {
    mockSignOut.mockResolvedValue({});
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.logout();
    });
    expect(mockSignOut).toHaveBeenCalled();
  });
});
