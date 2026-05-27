import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../config/api';

export type Tier = 'free' | 'plus' | 'pro';

export interface SubscriptionSummary {
  tier: Tier;
  status: string;
  current_period_start: number | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  has_customer: boolean;
}

const FREE_SUMMARY: SubscriptionSummary = {
  tier: 'free',
  status: 'none',
  current_period_start: null,
  current_period_end: null,
  cancel_at_period_end: false,
  has_customer: false,
};

export function useSubscription(userId: string | null) {
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setSummary(FREE_SUMMARY);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/billing/summary?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) throw new Error(`billing/summary ${res.status}`);
      const data = (await res.json()) as SubscriptionSummary;
      setSummary(data);
    } catch (e) {
      setError((e as Error).message);
      setSummary(FREE_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { summary, loading, error, refresh };
}

export async function startCheckout(
  userId: string,
  tier: 'plus' | 'pro',
  customerEmail?: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/billing/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, tier, customerEmail }),
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error ?? `checkout ${res.status}`);
  }
  const data = (await res.json()) as { checkout_url: string };
  return data.checkout_url;
}

export async function openCustomerPortal(userId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/billing/portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error ?? `portal ${res.status}`);
  }
  const data = (await res.json()) as { portal_url: string };
  return data.portal_url;
}
