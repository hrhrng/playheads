import type { APIRoute } from 'astro';
import { getSupabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env ?? import.meta.env;

  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return Response.json({ error: 'Email is required.' }, { status: 400 });
    }

    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return Response.json({ error: 'Please enter a valid email.' }, { status: 400 });
    }

    const supabase = getSupabase(env);

    // Check if already exists
    const { data: existing } = await supabase
      .from('waitlist')
      .select('status')
      .eq('email', normalized)
      .single();

    if (existing) {
      if (existing.status === 'approved') {
        return Response.json({ message: "You're already approved! Sign in to get started." });
      }
      return Response.json({ message: "You're already on the list! We'll notify you soon." });
    }

    // Insert new entry
    const { error } = await supabase
      .from('waitlist')
      .insert({ email: normalized });

    if (error) {
      if (error.code === '23505') {
        return Response.json({ message: "You're already on the list! We'll notify you soon." });
      }
      console.error('Waitlist insert error:', error);
      return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return Response.json({ message: "You're on the list! We'll be in touch soon." });
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
};
