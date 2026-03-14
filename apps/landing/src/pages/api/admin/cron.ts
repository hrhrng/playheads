import type { APIRoute } from 'astro';
import { getSupabase } from '../../../lib/supabase';
import { syncWaitlistApproval } from '../../../lib/sync-user-metadata';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env ?? import.meta.env;

  // Verify cron secret
  const secret = request.headers.get('x-cron-secret') || new URL(request.url).searchParams.get('secret');
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase(env);

  // Get config
  const { data: config, error: configError } = await supabase
    .from('waitlist_config')
    .select('*')
    .eq('id', 1)
    .single();

  if (configError || !config) {
    return Response.json({ error: 'Config not found' }, { status: 500 });
  }

  if (!config.auto_approve_enabled) {
    return Response.json({ message: 'Auto-approve is disabled', approved: 0 });
  }

  const today = new Date().toISOString().split('T')[0];

  // Reset daily counter if new day
  let approvedToday = config.auto_approved_today;
  if (config.last_reset_date !== today) {
    approvedToday = 0;
    await supabase
      .from('waitlist_config')
      .update({ auto_approved_today: 0, last_reset_date: today, updated_at: new Date().toISOString() })
      .eq('id', 1);
  }

  const remaining = config.auto_approve_per_day - approvedToday;
  if (remaining <= 0) {
    return Response.json({ message: 'Daily quota reached', approved: 0 });
  }

  // Get pending users (FIFO)
  const { data: pending, error: fetchError } = await supabase
    .from('waitlist')
    .select('id, email')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(remaining);

  if (fetchError || !pending?.length) {
    return Response.json({ message: 'No pending users', approved: 0 });
  }

  const ids = pending.map((p) => p.id);
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('waitlist')
    .update({
      status: 'approved',
      approved_at: now,
      approved_by: 'auto',
      updated_at: now,
    })
    .in('id', ids);

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  // Sync user_metadata.waitlist_approved on auth.users
  await Promise.allSettled(
    pending.map((entry) => syncWaitlistApproval(supabase, entry.email))
  );

  // Update counter
  await supabase
    .from('waitlist_config')
    .update({
      auto_approved_today: approvedToday + ids.length,
      last_reset_date: today,
      updated_at: now,
    })
    .eq('id', 1);

  return Response.json({ message: `Approved ${ids.length} users`, approved: ids.length });
};
