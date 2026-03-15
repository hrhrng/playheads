import type { APIRoute } from 'astro';
import { drizzle } from 'drizzle-orm/d1';
import { schema } from '@playheads/auth';
import { eq } from 'drizzle-orm';

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

    const db = drizzle(env.DB);

    // Check if already exists
    const [existing] = await db
      .select({ status: schema.waitlist.status })
      .from(schema.waitlist)
      .where(eq(schema.waitlist.email, normalized));

    if (existing) {
      return Response.json({
        status: existing.status,
        message: existing.status === 'approved'
          ? "You're approved! Check your email to sign in."
          : "You're on the list! We'll notify you when it's your turn.",
      });
    }

    // Insert new entry
    const now = Date.now();
    const id = crypto.randomUUID();

    await db.insert(schema.waitlist).values({
      id,
      email: normalized,
      createdAt: now,
      updatedAt: now,
    });

    return Response.json({
      status: 'pending',
      message: "You're on the list! We'll notify you when it's your turn.",
    });
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE')) {
      return Response.json({
        status: 'pending',
        message: "You're on the list! We'll notify you when it's your turn.",
      });
    }
    console.error('Waitlist error:', err);
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
};
