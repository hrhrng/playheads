import type { APIRoute } from 'astro';
import { getSupabase } from '../../../lib/supabase';
import { verifyAdmin } from '../../../lib/admin-auth';
import { syncWaitlistApproval } from '../../../lib/sync-user-metadata';

export const GET: APIRoute = async ({ request, url, locals }) => {
  const env = (locals as any).runtime?.env ?? import.meta.env;
  const admin = await verifyAdmin(request, env);
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase(env);
  const status = url.searchParams.get('status') || undefined;
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 50;
  const offset = (page - 1) * limit;

  let query = supabase.from('waitlist').select('*', { count: 'exact' });
  if (status) query = query.eq('status', status);
  query = query.order('created_at', { ascending: true }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Get stats
  const [
    { count: total },
    { count: pending },
    { count: approved },
    { count: rejected },
  ] = await Promise.all([
    supabase.from('waitlist').select('*', { count: 'exact', head: true }),
    supabase.from('waitlist').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('waitlist').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('waitlist').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
  ]);

  return Response.json({
    data,
    pagination: { page, limit, total: count },
    stats: { total, pending, approved, rejected },
  });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env ?? import.meta.env;
  const admin = await verifyAdmin(request, env);
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase(env);

  try {
    const { ids, action } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json({ error: 'ids[] is required.' }, { status: 400 });
    }
    if (!['approve', 'reject'].includes(action)) {
      return Response.json({ error: 'action must be "approve" or "reject".' }, { status: 400 });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const updates: Record<string, any> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (action === 'approve') {
      updates.approved_at = new Date().toISOString();
      updates.approved_by = admin.email;
    }

    const { error } = await supabase
      .from('waitlist')
      .update(updates)
      .in('id', ids);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Sync user_metadata.waitlist_approved on auth.users so apps/web can gate access
    // without querying the waitlist table directly
    if (action === 'approve') {
      const { data: approvedEntries } = await supabase
        .from('waitlist')
        .select('email')
        .in('id', ids);

      if (approvedEntries) {
        await Promise.allSettled(
          approvedEntries.map((entry) => syncWaitlistApproval(supabase, entry.email))
        );
      }
    }

    return Response.json({ success: true, updated: ids.length });
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
};
