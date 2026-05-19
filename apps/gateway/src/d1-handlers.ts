/**
 * D1-native handlers for conversation and session endpoints.
 *
 * These run directly in the Gateway Worker with native D1 binding,
 * avoiding the REST API overhead (~100-300ms per call) that the
 * Python backend incurs.
 */
import { drizzle } from "drizzle-orm/d1";
import { schema } from "@playheads/auth";
import { eq, and, desc, lt, or } from "drizzle-orm";

// Re-export D1Database type for the Env interface
type D1 = D1Database;

// ---------------------------------------------------------------------------
// GET /api/conversations?user_id=...&limit=...&cursor=...
// ---------------------------------------------------------------------------
export async function handleListConversations(
  request: Request,
  DB: D1,
): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("user_id");
  if (!userId) {
    return Response.json({ error: "user_id required" }, { status: 400 });
  }

  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 20, 50));
  const cursor = url.searchParams.get("cursor");

  const db = drizzle(DB);
  const t = schema.conversation;

  try {
    let rows;

    if (cursor) {
      const parts = cursor.split("_", 2);
      const cursorPinned = parts[0] === "1";
      const cursorUpdated = Number(parts[1]);

      rows = await db
        .select({
          id: t.id,
          title: t.title,
          messageCount: t.messageCount,
          lastMessagePreview: t.lastMessagePreview,
          lastMessageAt: t.lastMessageAt,
          isPinned: t.isPinned,
          updatedAt: t.updatedAt,
          playlist: t.playlist,
        })
        .from(t)
        .where(
          and(
            eq(t.userId, userId),
            eq(t.isArchived, false),
            or(
              lt(t.isPinned, cursorPinned),
              and(eq(t.isPinned, cursorPinned), lt(t.updatedAt, cursorUpdated)),
            ),
          ),
        )
        .orderBy(desc(t.isPinned), desc(t.updatedAt))
        .limit(limit + 1);
    } else {
      rows = await db
        .select({
          id: t.id,
          title: t.title,
          messageCount: t.messageCount,
          lastMessagePreview: t.lastMessagePreview,
          lastMessageAt: t.lastMessageAt,
          isPinned: t.isPinned,
          updatedAt: t.updatedAt,
          playlist: t.playlist,
        })
        .from(t)
        .where(and(eq(t.userId, userId), eq(t.isArchived, false)))
        .orderBy(desc(t.isPinned), desc(t.updatedAt))
        .limit(limit + 1);
    }

    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);

    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const last = pageRows[pageRows.length - 1];
      nextCursor = `${last.isPinned ? 1 : 0}_${last.updatedAt}`;
    }

    return Response.json({
      conversations: pageRows.map((c) => {
        // Parse playlist JSON; expose track count + first track's artwork
        // for cover thumb in the sidebar / topics grid. Send the full
        // array too so the client can restore the topic on load.
        let playlist: Array<Record<string, unknown>> = [];
        try { playlist = JSON.parse(c.playlist || '[]'); } catch { /* ignore */ }
        const first = playlist[0] as { artworkUrl?: string } | undefined;
        return {
          id: c.id,
          title: c.title,
          message_count: c.messageCount ?? 0,
          last_message_preview: c.lastMessagePreview,
          last_message_at: c.lastMessageAt != null ? String(c.lastMessageAt) : null,
          is_pinned: Boolean(c.isPinned),
          updated_at: String(c.updatedAt ?? ""),
          playlist,
          playlist_count: playlist.length,
          playlist_cover: first?.artworkUrl ?? null,
        };
      }),
      has_more: hasMore,
      next_cursor: nextCursor,
    });
  } catch (e) {
    console.error("Failed to list conversations:", e);
    return Response.json(
      { error: "Failed to list conversations" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/conversations/create  { user_id }
// ---------------------------------------------------------------------------
export async function handleCreateConversation(
  request: Request,
  DB: D1,
): Promise<Response> {
  const body = (await request.json()) as { user_id: string };
  if (!body.user_id) {
    return Response.json({ error: "user_id is required" }, { status: 400 });
  }

  const now = Date.now();
  const conversationId = crypto.randomUUID();
  const stateId = crypto.randomUUID();

  try {
    // Use D1 batch — both inserts in a single round-trip
    await DB.batch([
      DB.prepare(
        'INSERT OR IGNORE INTO "conversation" ("id","userId","messageCount","isPinned","isArchived","createdAt","updatedAt") VALUES (?,?,0,0,0,?,?)',
      ).bind(conversationId, body.user_id, now, now),
      DB.prepare(
        'INSERT OR IGNORE INTO "conversationState" ("id","conversationId","messages","context","createdAt","updatedAt") VALUES (?,?,\'[]\',\'{}\',?,?)',
      ).bind(stateId, conversationId, now, now),
    ]);

    return Response.json({
      conversation_id: conversationId,
      created_at: new Date(now).toISOString(),
    });
  } catch (e) {
    console.error("Failed to create conversation:", e);
    return Response.json(
      { error: "Failed to create conversation" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/conversations/:id?user_id=...
// ---------------------------------------------------------------------------
export async function handleDeleteConversation(
  conversationId: string,
  request: Request,
  DB: D1,
): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("user_id");
  if (!userId) {
    return Response.json({ error: "user_id required" }, { status: 400 });
  }

  const db = drizzle(DB);

  // Verify ownership
  const [row] = await db
    .select({ id: schema.conversation.id })
    .from(schema.conversation)
    .where(
      and(
        eq(schema.conversation.id, conversationId),
        eq(schema.conversation.userId, userId),
      ),
    );

  if (!row) {
    return Response.json(
      { error: "Conversation not found or access denied" },
      { status: 404 },
    );
  }

  // Batch delete state + conversation
  await DB.batch([
    DB.prepare('DELETE FROM "conversationState" WHERE "conversationId" = ?').bind(
      conversationId,
    ),
    DB.prepare('DELETE FROM "conversation" WHERE "id" = ?').bind(conversationId),
  ]);

  return Response.json({ success: true, deleted: conversationId });
}

// ---------------------------------------------------------------------------
// PATCH /api/conversations/:id?user_id=...  { title?, is_pinned?, is_archived? }
// ---------------------------------------------------------------------------
export async function handleUpdateConversation(
  conversationId: string,
  request: Request,
  DB: D1,
): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("user_id");
  if (!userId) {
    return Response.json({ error: "user_id required" }, { status: 400 });
  }

  const body = (await request.json()) as {
    title?: string;
    is_pinned?: boolean;
    is_archived?: boolean;
  };

  const db = drizzle(DB);

  // Verify ownership
  const [row] = await db
    .select({ id: schema.conversation.id })
    .from(schema.conversation)
    .where(
      and(
        eq(schema.conversation.id, conversationId),
        eq(schema.conversation.userId, userId),
      ),
    );

  if (!row) {
    return Response.json(
      { error: "Conversation not found or access denied" },
      { status: 404 },
    );
  }

  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  const fields: string[] = [];

  if (body.title !== undefined) {
    updates.title = body.title;
    fields.push("title");
  }
  if (body.is_pinned !== undefined) {
    updates.isPinned = body.is_pinned;
    fields.push("isPinned");
  }
  if (body.is_archived !== undefined) {
    updates.isArchived = body.is_archived;
    fields.push("isArchived");
  }

  if (fields.length === 0) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  await db
    .update(schema.conversation)
    .set(updates)
    .where(eq(schema.conversation.id, conversationId));

  return Response.json({
    success: true,
    updated: conversationId,
    fields,
  });
}

// ---------------------------------------------------------------------------
// GET /api/conversations/:id/title?user_id=...
// ---------------------------------------------------------------------------
export async function handleGetConversationTitle(
  conversationId: string,
  request: Request,
  DB: D1,
): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("user_id");
  if (!userId) {
    return Response.json({ error: "user_id required" }, { status: 400 });
  }

  const db = drizzle(DB);
  const t = schema.conversation;

  const [row] = await db
    .select({ title: t.title })
    .from(t)
    .where(and(eq(t.id, conversationId), eq(t.userId, userId)));

  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ title: row.title });
}

// ---------------------------------------------------------------------------
// GET /api/conversations/:id?user_id=...
// Returns the full conversation row (id, title, playlist) so the client can
// restore the topic on chat load.
// ---------------------------------------------------------------------------
export async function handleGetConversation(
  conversationId: string,
  request: Request,
  DB: D1,
): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("user_id");
  if (!userId) {
    return Response.json({ error: "user_id required" }, { status: 400 });
  }

  const db = drizzle(DB);
  const t = schema.conversation;

  const [row] = await db
    .select({
      id: t.id,
      title: t.title,
      messageCount: t.messageCount,
      lastMessagePreview: t.lastMessagePreview,
      lastMessageAt: t.lastMessageAt,
      isPinned: t.isPinned,
      updatedAt: t.updatedAt,
      playlist: t.playlist,
    })
    .from(t)
    .where(and(eq(t.id, conversationId), eq(t.userId, userId)));

  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let playlist: Array<Record<string, unknown>> = [];
  try { playlist = JSON.parse(row.playlist || '[]'); } catch { /* ignore */ }
  const first = playlist[0] as { artworkUrl?: string } | undefined;

  return Response.json({
    id: row.id,
    title: row.title,
    message_count: row.messageCount ?? 0,
    last_message_preview: row.lastMessagePreview,
    last_message_at: row.lastMessageAt != null ? String(row.lastMessageAt) : null,
    is_pinned: Boolean(row.isPinned),
    updated_at: String(row.updatedAt ?? ""),
    playlist,
    playlist_count: playlist.length,
    playlist_cover: first?.artworkUrl ?? null,
  });
}

// ---------------------------------------------------------------------------
// POST /api/session/create  { user_id }
// ---------------------------------------------------------------------------
export async function handleCreateSession(
  request: Request,
  DB: D1,
): Promise<Response> {
  const body = (await request.json()) as { user_id: string };
  if (!body.user_id) {
    return Response.json({ error: "user_id is required" }, { status: 400 });
  }

  const now = Date.now();
  const sessionId = crypto.randomUUID();
  const stateId = crypto.randomUUID();

  try {
    await DB.batch([
      DB.prepare(
        'INSERT OR IGNORE INTO "conversation" ("id","userId","messageCount","isPinned","isArchived","createdAt","updatedAt") VALUES (?,?,0,0,0,?,?)',
      ).bind(sessionId, body.user_id, now, now),
      DB.prepare(
        'INSERT OR IGNORE INTO "conversationState" ("id","conversationId","messages","context","createdAt","updatedAt") VALUES (?,?,\'[]\',\'{}\',?,?)',
      ).bind(stateId, sessionId, now, now),
    ]);

    return Response.json({ session_id: sessionId });
  } catch (e) {
    console.error("Failed to create session:", e);
    return Response.json(
      { error: "Failed to create session" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/state?session_id=...&user_id=...
// ---------------------------------------------------------------------------
export async function handleGetState(
  request: Request,
  DB: D1,
): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const userId = url.searchParams.get("user_id");

  if (!sessionId) {
    return Response.json({
      session_id: "default",
      current_track: null,
      playlist: [],
      is_playing: false,
      playback_position: 0,
      chat_history: [],
    });
  }

  try {
    // Batch: ownership check + state fetch in a single round-trip
    const results = await DB.batch([
      userId
        ? DB.prepare(
            'SELECT "id" FROM "conversation" WHERE "id" = ? AND "userId" = ?',
          ).bind(sessionId, userId)
        : DB.prepare('SELECT "id" FROM "conversation" WHERE "id" = ?').bind(
            sessionId,
          ),
      DB.prepare(
        'SELECT "messages","context" FROM "conversationState" WHERE "conversationId" = ?',
      ).bind(sessionId),
    ]);

    const convRows = results[0].results;
    const stateRows = results[1].results as Array<{
      messages: string;
      context: string;
    }>;

    // Return empty state if conversation not found or no state yet
    if (!convRows.length || !stateRows.length) {
      return Response.json({
        session_id: sessionId,
        current_track: null,
        playlist: [],
        is_playing: false,
        playback_position: 0,
        chat_history: [],
      });
    }

    const row = stateRows[0];
    const messages = JSON.parse(row.messages || "[]");
    const context = JSON.parse(row.context || "{}");

    // Format chat history for frontend (last 20)
    const chatHistory = messages.slice(-20).map((m: any) => {
      const base = m.parts
        ? { role: m.role, parts: m.parts }
        : { role: m.role, content: m.content };
      return { ...base, timestamp: m.timestamp || new Date().toISOString() };
    });

    return Response.json({
      session_id: sessionId,
      current_track: context.current_track || null,
      playlist: context.playlist || [],
      is_playing: context.is_playing || false,
      playback_position: context.playback_position || 0,
      chat_history: chatHistory,
    });
  } catch (e) {
    console.error("Failed to get state:", e);
    return Response.json(
      { error: "Failed to get state" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/state/sync  { session_id, user_id, current_track?, playlist?, ... }
// ---------------------------------------------------------------------------
export async function handleSyncState(
  request: Request,
  DB: D1,
): Promise<Response> {
  const body = (await request.json()) as {
    session_id?: string;
    user_id?: string;
    current_track?: unknown;
    playlist?: unknown[];
    is_playing?: boolean;
    playback_position?: number;
  };

  if (!body.session_id) {
    return Response.json({ error: "Session ID required" });
  }
  if (!body.user_id) {
    return Response.json({ error: "user_id required for sync" });
  }

  try {
    // Batch: permission check + context read in single round-trip
    const results = await DB.batch([
      DB.prepare(
        'SELECT "id" FROM "conversation" WHERE "id" = ? AND "userId" = ?',
      ).bind(body.session_id, body.user_id),
      DB.prepare(
        'SELECT "context" FROM "conversationState" WHERE "conversationId" = ?',
      ).bind(body.session_id),
    ]);

    const convRows = results[0].results;
    if (!convRows.length) {
      return Response.json({
        status: "no_session",
        session_id: body.session_id,
      });
    }

    const existingRows = results[1].results as Array<{ context: string }>;
    const existingContext = existingRows.length
      ? JSON.parse(existingRows[0].context || "{}")
      : {};

    // Merge updates
    const update: Record<string, unknown> = {};
    if (body.current_track !== undefined) update.current_track = body.current_track;
    if (body.playlist !== undefined) update.playlist = body.playlist;
    if (body.is_playing !== undefined) update.is_playing = body.is_playing;
    if (body.playback_position !== undefined)
      update.playback_position = body.playback_position;

    const merged = { ...existingContext, ...update };
    const now = Date.now();

    await DB.prepare(
      'UPDATE "conversationState" SET "context" = ?, "updatedAt" = ? WHERE "conversationId" = ?',
    )
      .bind(JSON.stringify(merged), now, body.session_id)
      .run();

    return Response.json({
      status: "synced",
      session_id: body.session_id,
      last_sync: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Failed to sync state:", e);
    return Response.json({ error: "Failed to sync state" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET /api/queue?user_id=...
// ---------------------------------------------------------------------------
export async function handleGetQueue(
  request: Request,
  DB: D1,
): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("user_id");
  if (!userId) {
    return Response.json({ error: "user_id required" }, { status: 400 });
  }

  try {
    // Raw SQL to handle case where columns may not exist yet (migration pending)
    const row = await DB.prepare(
      'SELECT "queue", "queueIndex" FROM "profile" WHERE "id" = ?',
    )
      .bind(userId)
      .first<{ queue: string; queueIndex: number }>();

    if (!row) {
      return Response.json({ queue: [], currentIndex: -1 });
    }

    return Response.json({
      queue: JSON.parse(row.queue || "[]"),
      currentIndex: row.queueIndex ?? -1,
    });
  } catch (e) {
    // If columns don't exist yet (migration not applied), return empty
    const msg = String(e);
    if (msg.includes("no such column") || msg.includes("queue")) {
      return Response.json({ queue: [], currentIndex: -1 });
    }
    console.error("Failed to get queue:", e);
    return Response.json({ error: "Failed to get queue" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/queue/sync  { user_id, queue, currentIndex }
// ---------------------------------------------------------------------------
export async function handleSyncQueue(
  request: Request,
  DB: D1,
): Promise<Response> {
  const body = (await request.json()) as {
    user_id?: string;
    queue?: unknown[];
    currentIndex?: number;
  };

  if (!body.user_id) {
    return Response.json({ error: "user_id required" }, { status: 400 });
  }

  try {
    const now = Date.now();
    await DB.prepare(
      'UPDATE "profile" SET "queue" = ?, "queueIndex" = ?, "queueUpdatedAt" = ?, "updatedAt" = ? WHERE "id" = ?',
    )
      .bind(
        JSON.stringify(body.queue || []),
        body.currentIndex ?? -1,
        now,
        now,
        body.user_id,
      )
      .run();

    return Response.json({
      status: "synced",
      last_sync: new Date(now).toISOString(),
    });
  } catch (e) {
    // If columns don't exist yet (migration not applied), silently succeed
    const msg = String(e);
    if (msg.includes("no such column")) {
      return Response.json({ status: "skipped", reason: "migration_pending" });
    }
    console.error("Failed to sync queue:", e);
    return Response.json({ error: "Failed to sync queue" }, { status: 500 });
  }
}
