import { useEffect, useState } from 'react';
import { API_BASE } from '../config/api';
import type { AuthSession } from './useAuth';

type WaitlistStatus = 'approved' | 'pending';

/**
 * Gate result + a global-bypass switch. When the server reports
 * `bypass: true` (controlled by WAITLIST_BYPASS_ENABLED in gateway
 * wrangler.*.toml), every signed-in user is treated as approved.
 * Otherwise we fall back to the per-user `waitlistApproved` flag.
 */
export function useWaitlistGate(session: AuthSession | null): WaitlistStatus {
  const [bypass, setBypass] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/waitlist/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { bypass?: boolean } | null) => {
        if (!cancelled) setBypass(!!data?.bypass);
      })
      .catch(() => { if (!cancelled) setBypass(false); });
    return () => { cancelled = true; };
  }, []);

  if (!session?.user) return 'pending';
  if (bypass) return 'approved';
  return session.user.waitlistApproved === true ? 'approved' : 'pending';
}
