"""
Music Agent API
"""
import json
import logging
import os
import time
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

# Load environment variables FIRST (override=True to override system env vars)
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'), override=True)


# JSON structured logging for Cloudflare container log collection
class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "ts": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            **({"exc": self.formatException(record.exc_info)} if record.exc_info else {}),
        })


handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler])
log = logging.getLogger("playhead")

# Then import database which depends on env vars
from apps.backend.database import get_db, DATABASE_URL_RAW, warmup_pool
from apps.backend import d1_client

app = FastAPI(title="Playhead Music Agent API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def timing_middleware(request: Request, call_next):
    """Log total request duration for every endpoint."""
    t0 = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - t0) * 1000
    path = request.url.path
    # Skip noisy health checks
    if path not in ("/health", "/"):
        log.info("⏱ %s %s → %d  %.0fms", request.method, path, response.status_code, elapsed_ms)
    return response


from apps.backend.apple_music import router as apple_music_router

app.include_router(apple_music_router)


# =============================================================================
# Startup / Shutdown Events
# =============================================================================

@app.on_event("startup")
async def startup_event():
    """Log configuration summary on startup and warm up DB pool."""
    db_host = DATABASE_URL_RAW.split("@")[-1].split("/")[0] if "@" in DATABASE_URL_RAW else "unknown"
    openai_key = os.getenv("OPENAI_API_KEY", "")
    openai_base = os.getenv("OPENAI_BASE_URL", "(default)")

    log.info("=" * 60)
    log.info("Playhead Music Agent API v2.0 starting up")
    log.info("-" * 60)
    log.info("DB host       : %s", db_host)
    log.info("OPENAI_API_KEY: %s", f"{openai_key[:8]}...{openai_key[-4:]}" if len(openai_key) > 12 else ("SET" if openai_key else "NOT SET"))
    log.info("OPENAI_BASE   : %s", openai_base)
    log.info("=" * 60)

    # Warm up DB connection pool — pay TCP+SSL cost at startup, not on first request
    try:
        await warmup_pool()
    except Exception as e:
        log.warning("DB pool warmup failed (will connect on first request): %s", e)

    # D1 REST client is stateless, no init needed


# =============================================================================
# Request/Response Models
# =============================================================================

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None  # Optional - backend will create if None
    user_id: str  # Required for authentication



class ChatResponse(BaseModel):
    response: str
    actions: list[str] = []
    session_id: str
    audio: Optional[str] = None


class SyncRequest(BaseModel):
    session_id: Optional[str] = None
    user_id: Optional[str] = None  # Added for permission check
    current_track: Optional[dict] = None
    playlist: Optional[list[dict]] = None
    is_playing: Optional[bool] = None
    playback_position: Optional[float] = None


class StateResponse(BaseModel):
    session_id: str
    current_track: Optional[dict] = None
    playlist: list[dict] = []
    is_playing: bool = False
    playback_position: float = 0.0
    chat_history: list[dict] = []


# =============================================================================
# Endpoints
# =============================================================================

@app.get("/")
def read_root():
    return {"message": "Playhead Music Agent API v2.0", "status": "running"}


async def _format_sse_events(agent_event_generator, session_id: str):
    """
    Shared helper: convert agent event dicts into SSE wire format.

    Wraps the agent's async generator with error classification and proper
    SSE formatting. Used by the /chat endpoint.
    """
    import json

    try:
        async for event_obj in agent_event_generator:
            event_type = event_obj.get("event", "text")
            event_data = event_obj.get("data", {})
            yield f"event: {event_type}\ndata: {json.dumps(event_data)}\n\n"

    except Exception as e:
        # Classify error for structured response and actionable user feedback
        error_code, user_message, retryable = _classify_error(e)
        log.error("Stream error [%s] session=%s: %s", error_code, session_id, e, exc_info=True)

        yield f"event: text\ndata: {json.dumps({'content': user_message})}\n\n"

        done_data = {
            "error": str(e),
            "error_code": error_code,
            "retryable": retryable,
            "actions": [],
            "state": {},
        }
        yield f"event: done\ndata: {json.dumps(done_data)}\n\n"


async def chat_stream_generator(message: str, session_id: str, user_id: str):
    """
    Generate streaming chat responses with proper database connection lifecycle.

    Creates and manages its own database session to ensure connections are
    properly closed even if the client disconnects mid-stream.
    """
    from apps.backend.agent import run_agent_stream
    from apps.backend.database import AsyncSessionLocal

    db = AsyncSessionLocal()
    try:
        async for sse_line in _format_sse_events(
            run_agent_stream(db, message, session_id, user_id),
            session_id,
        ):
            yield sse_line
    finally:
        await db.close()



def _classify_error(e: Exception) -> tuple[str, str, bool]:
    """
    Classify an exception into (error_code, user_message, retryable).

    Returns a tuple to drive both backend logging and frontend UX:
    - error_code:   machine-readable tag for the frontend
    - user_message: human-readable message shown to the user
    - retryable:    whether the frontend should offer a retry button
    """
    from sqlalchemy.exc import IntegrityError, OperationalError, DBAPIError

    error_str = str(e).lower()

    # -- Auth / Apple Music errors -----------------------------------------
    if isinstance(e, HTTPException):
        if isinstance(e.detail, dict):
            code = e.detail.get("error", "UNKNOWN_ERROR")
            if e.detail.get("action") == "reauth":
                return code, "Your Apple Music session expired. Please reconnect.", False
            return code, e.detail.get("message", str(e)), False
        return "HTTP_ERROR", str(e.detail), False

    # -- Database errors ---------------------------------------------------
    if isinstance(e, IntegrityError):
        if "foreign key" in error_str:
            return "DB_FK_VIOLATION", "Account data issue — please sign out and sign back in.", False
        return "DB_INTEGRITY", "Data conflict — please try again.", True

    if isinstance(e, OperationalError) or isinstance(e, DBAPIError):
        return "DB_UNAVAILABLE", "Database connection issue — retrying may help.", True

    # -- LLM / provider errors ---------------------------------------------
    if "openai" in error_str or "api_key" in error_str:
        return "LLM_CONFIG_ERROR", "AI service configuration issue. Please contact support.", False

    if "rate limit" in error_str or "429" in error_str:
        return "LLM_RATE_LIMIT", "Too many requests — please wait a moment and try again.", True

    if "timeout" in error_str:
        return "LLM_TIMEOUT", "AI service timed out — please try again.", True

    # -- Dependency / import errors ----------------------------------------
    if isinstance(e, (ImportError, ModuleNotFoundError)):
        return "DEPENDENCY_MISSING", "Server dependency issue. Please contact support.", False

    # -- Fallback ----------------------------------------------------------
    return "UNKNOWN_ERROR", "Sorry, something went wrong. Try again? 🎧", True


@app.post("/chat")
async def chat(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    """Chat with the music agent. Creates session if session_id is None. Supports streaming."""
    import uuid

    if not request.user_id:
        raise HTTPException(400, "user_id is required")

    # Generate new session_id if not provided (delayed creation)
    session_id = request.session_id
    if not session_id:
        session_id = str(uuid.uuid4())
        log.info("New session created: %s (user=%s)", session_id[:8], request.user_id[:8])

    log.info("Chat request: session=%s msg=%s", session_id[:8], request.message[:60])

    return StreamingResponse(
        chat_stream_generator(request.message, session_id, request.user_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )



@app.get("/state", response_model=StateResponse)
async def get_state(session_id: Optional[str] = None, user_id: Optional[str] = None):
    """Get current session state."""
    from apps.backend.state import store

    # Return empty state if no session_id
    if not session_id:
         return StateResponse(session_id="default")

    # Get session (returns None if not exists or state row missing)
    session = await store.get_session(None, session_id, user_id) if user_id else None

    # Return empty state if session not found — avoids 404 for newly created
    # conversations that don't have a conversationState row yet
    if not session:
        return StateResponse(session_id=session_id)

    return StateResponse(
        session_id=session.session_id,
        current_track=session.current_track.model_dump() if session.current_track else None,
        playlist=[t.model_dump() for t in session.playlist],
        is_playing=session.is_playing,
        playback_position=session.playback_position,
        chat_history=[
            m.to_frontend_format() | {"timestamp": m.timestamp.isoformat()}
            for m in session.chat_history[-20:]  # Last 20 messages
        ]
    )


@app.post("/state/sync")
async def sync_state(request: SyncRequest):
    """
    Sync frontend playback state (context) to backend via Supabase REST.

    IMPORTANT: Only updates the `context` and `last_synced_at` columns.
    Never touches `messages` — messages are persisted exclusively by
    run_agent_stream via /chat.
    """
    import uuid as _uuid

    if not request.session_id:
        return {"error": "Session ID required"}
    if not request.user_id:
        return {"error": "user_id required for sync"}

    import json as _json

    # Permission check
    rows = await d1_client.query(
        'SELECT "id" FROM "conversation" WHERE "id" = ? AND "userId" = ?',
        [request.session_id, request.user_id]
    )
    if not rows:
        return {"status": "no_session", "session_id": request.session_id}

    # Build partial context update
    context_update: dict = {}
    if request.current_track:
        context_update["current_track"] = request.current_track
    if request.playlist is not None:
        context_update["playlist"] = request.playlist
    if request.is_playing is not None:
        context_update["is_playing"] = request.is_playing
    if request.playback_position is not None:
        context_update["playback_position"] = request.playback_position

    # Read-merge-write to avoid clobbering unrelated fields
    existing = await d1_client.query(
        'SELECT "context" FROM "conversationState" WHERE "conversationId" = ?',
        [request.session_id]
    )
    existing_context = _json.loads((existing[0] or {}).get("context", "{}")) if existing else {}
    merged_context = {**existing_context, **context_update}

    now = int(time.time() * 1000)
    await d1_client.execute(
        'UPDATE "conversationState" SET "context" = ?, "updatedAt" = ? WHERE "conversationId" = ?',
        [_json.dumps(merged_context), now, request.session_id]
    )

    return {
        "status": "synced",
        "session_id": request.session_id,
        "last_sync": datetime.now().isoformat(),
    }


class CreateSessionRequest(BaseModel):
    user_id: str


@app.post("/session/create")
async def create_session(request: CreateSessionRequest):
    """Create a new empty session and return the session_id."""
    import uuid
    from apps.backend.state import store

    if not request.user_id:
        raise HTTPException(400, "user_id is required")

    session_id = str(uuid.uuid4())
    session = await store.create_session(None, session_id, request.user_id)

    return {
        "session_id": session.session_id
    }


# =============================================================================
# Conversations List
# =============================================================================

class ConversationItem(BaseModel):
    id: str
    title: Optional[str]
    message_count: int
    last_message_preview: Optional[str]
    last_message_at: Optional[str]
    is_pinned: bool
    updated_at: str

class ConversationsResponse(BaseModel):
    conversations: list[ConversationItem]
    has_more: bool = False
    next_cursor: Optional[str] = None

class CreateConversationRequest(BaseModel):
    user_id: str

class CreateConversationResponse(BaseModel):
    conversation_id: str
    created_at: str

@app.post("/conversations/create", response_model=CreateConversationResponse)
async def create_conversation(request: CreateConversationRequest):
    """Create a new empty conversation."""
    from apps.backend.state import store
    import uuid

    try:
        new_conversation_id = str(uuid.uuid4())
        await store.create_session(None, new_conversation_id, request.user_id)
        log.info("Conversation created: %s (user=%s)", new_conversation_id[:8], request.user_id[:8])

        return CreateConversationResponse(
            conversation_id=new_conversation_id,
            created_at=datetime.now().isoformat()
        )
    except Exception as e:
        log.error("Failed to create conversation for user=%s: %s", request.user_id[:8], e, exc_info=True)
        raise HTTPException(500, f"Failed to create conversation: {str(e)}")

@app.get("/conversations", response_model=ConversationsResponse)
async def list_conversations(
    user_id: str,
    limit: int = 20,
    cursor: Optional[str] = None,
):
    """List user's conversations with cursor-based pagination.

    Cursor format: "{isPinned}_{updatedAt}" — encodes the position of the last
    item on the previous page so the next page can start right after it.
    """
    try:
        # Clamp limit to [1, 50]
        limit = max(1, min(limit, 50))

        # Build query with optional cursor for pagination
        params: list = [user_id]

        if cursor:
            # Parse cursor: "isPinned_updatedAt"
            parts = cursor.split("_", 1)
            cursor_pinned = int(parts[0])
            cursor_updated = int(parts[1])

            # Fetch rows after cursor position using (isPinned, updatedAt) ordering
            # isPinned DESC, updatedAt DESC — so "after" means either:
            #   - same pinned status but older (lower updatedAt)
            #   - lower pinned status (unpinned after pinned)
            sql = (
                'SELECT "id", "title", "messageCount", "lastMessagePreview", "lastMessageAt", "isPinned", "updatedAt" '
                'FROM "conversation" WHERE "userId" = ? AND "isArchived" = 0 '
                'AND ("isPinned" < ? OR ("isPinned" = ? AND "updatedAt" < ?)) '
                'ORDER BY "isPinned" DESC, "updatedAt" DESC LIMIT ?'
            )
            params.extend([cursor_pinned, cursor_pinned, cursor_updated, limit + 1])
        else:
            sql = (
                'SELECT "id", "title", "messageCount", "lastMessagePreview", "lastMessageAt", "isPinned", "updatedAt" '
                'FROM "conversation" WHERE "userId" = ? AND "isArchived" = 0 '
                'ORDER BY "isPinned" DESC, "updatedAt" DESC LIMIT ?'
            )
            params.append(limit + 1)

        rows = await d1_client.query(sql, params)

        # Check if there are more pages
        has_more = len(rows) > limit
        page_rows = rows[:limit]

        # Build next cursor from last item
        next_cursor = None
        if has_more and page_rows:
            last = page_rows[-1]
            next_cursor = f"{1 if last.get('isPinned') else 0}_{last.get('updatedAt', 0)}"

        return ConversationsResponse(
            conversations=[
                ConversationItem(
                    id=str(c["id"]),
                    title=c.get("title"),
                    message_count=c.get("messageCount") or 0,
                    last_message_preview=c.get("lastMessagePreview"),
                    last_message_at=str(c["lastMessageAt"]) if c.get("lastMessageAt") else None,
                    is_pinned=bool(c.get("isPinned")),
                    updated_at=str(c.get("updatedAt") or "")
                ) for c in page_rows
            ],
            has_more=has_more,
            next_cursor=next_cursor,
        )
    except Exception as e:
        log.error("Failed to list conversations for user=%s: %s", user_id[:8], e, exc_info=True)
        raise HTTPException(500, f"Failed to list conversations: {str(e)}")


@app.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, user_id: str):
    """Delete a conversation (with permission check)."""
    # Verify ownership
    rows = await d1_client.query(
        'SELECT "id" FROM "conversation" WHERE "id" = ? AND "userId" = ?',
        [conversation_id, user_id]
    )
    if not rows:
        raise HTTPException(404, "Conversation not found or access denied")

    # Delete state first, then conversation
    await d1_client.execute(
        'DELETE FROM "conversationState" WHERE "conversationId" = ?',
        [conversation_id]
    )
    await d1_client.execute(
        'DELETE FROM "conversation" WHERE "id" = ?',
        [conversation_id]
    )

    return {"success": True, "deleted": conversation_id}


class ConversationUpdateRequest(BaseModel):
    title: Optional[str] = None
    is_pinned: Optional[bool] = None
    is_archived: Optional[bool] = None


@app.patch("/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    user_id: str,
    update_data: ConversationUpdateRequest,
):
    """Update conversation metadata."""
    # Verify ownership
    rows = await d1_client.query(
        'SELECT "id" FROM "conversation" WHERE "id" = ? AND "userId" = ?',
        [conversation_id, user_id]
    )
    if not rows:
        raise HTTPException(404, "Conversation not found or access denied")

    set_clauses = []
    params = []
    if update_data.title is not None:
        set_clauses.append('"title" = ?')
        params.append(update_data.title)
    if update_data.is_pinned is not None:
        set_clauses.append('"isPinned" = ?')
        params.append(1 if update_data.is_pinned else 0)
    if update_data.is_archived is not None:
        set_clauses.append('"isArchived" = ?')
        params.append(1 if update_data.is_archived else 0)

    if not set_clauses:
        raise HTTPException(400, "No fields to update")

    now = int(time.time() * 1000)
    set_clauses.append('"updatedAt" = ?')
    params.append(now)
    params.append(conversation_id)

    await d1_client.execute(
        f'UPDATE "conversation" SET {", ".join(set_clauses)} WHERE "id" = ?',
        params
    )

    return {"success": True, "updated": conversation_id, "fields": [c.split('"')[1] for c in set_clauses[:-1]]}



# Health check
@app.get("/health")
def health():
    return {"status": "healthy"}
