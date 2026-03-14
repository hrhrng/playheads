import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Mark a user's waitlist as approved in auth.users user_metadata.
 * This allows apps/web to gate access by reading session metadata
 * without needing direct access to the waitlist table.
 */
export async function syncWaitlistApproval(supabase: SupabaseClient, email: string): Promise<void> {
  // Find the auth user by email
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1,
  });

  if (error || !data?.users) return;

  // listUsers doesn't support email filter, so use getUserByEmail-like approach
  // via the admin API. We'll search through a targeted RPC or iterate.
  // Actually, use the REST approach: list and filter.
  // For efficiency, use the Supabase admin getUserById after looking up from our own table.

  // Better approach: query auth.users via service role SQL or just iterate
  // For now, use the admin API which is fine for approval volumes
  const { data: usersData } = await supabase.auth.admin.listUsers();
  const authUser = usersData?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (authUser) {
    await supabase.auth.admin.updateUserById(authUser.id, {
      user_metadata: { ...authUser.user_metadata, waitlist_approved: true },
    });
  }
}
