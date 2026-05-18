import type { AuthSession } from './useAuth';

type WaitlistStatus = 'approved' | 'pending';

export function useWaitlistGate(session: AuthSession | null): WaitlistStatus {
  if (!session?.user) return 'pending';
  return session.user.waitlistApproved === true ? 'approved' : 'pending';
}
