import type { APIRoute } from 'astro';
import { getSupabase } from '../../../lib/supabase';
import { verifyAdmin } from '../../../lib/admin-auth';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env ?? import.meta.env;
  const admin = await verifyAdmin(request, env);
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from('waitlist_config')
    .select('*')
    .eq('id', 1)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env ?? import.meta.env;
  const admin = await verifyAdmin(request, env);
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase(env);

  try {
    const body = await request.json();
    const allowed = ['auto_approve_enabled', 'auto_approve_per_day'];
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    const { data, error } = await supabase
      .from('waitlist_config')
      .update(updates)
      .eq('id', 1)
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
};
