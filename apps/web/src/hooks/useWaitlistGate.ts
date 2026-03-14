import type { SupabaseSession } from '../types';

type WaitlistStatus = 'approved' | 'pending';

export function useWaitlistGate(session: SupabaseSession | null): WaitlistStatus {
  if (!session?.user) return 'pending';
  return session.user.user_metadata?.waitlist_approved === true ? 'approved' : 'pending';
}
