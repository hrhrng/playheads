import { createClient } from '@supabase/supabase-js';

export async function verifyAdmin(request: Request, env: any): Promise<{ email: string } | null> {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/sb-access-token=([^;]+)/);
  const authHeader = request.headers.get('authorization');
  const token = match?.[1] || authHeader?.replace('Bearer ', '');

  if (!token) return null;

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user?.email) return null;

  const adminEmails = (env.ADMIN_EMAILS || '').split(',').map((e: string) => e.trim().toLowerCase());
  if (!adminEmails.includes(user.email.toLowerCase())) return null;

  return { email: user.email };
}
