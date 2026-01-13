"""
Music Agent API
"""
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
from datetime import datetime
import os
from sqlalchemy.ext.asyncio import AsyncSession

# Load environment variables FIRST
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# Then import database which depends on env vars
from apps.backend.database import get_db

app = FastAPI(title="Playhead Music Agent API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from apps.backend.apple_music import router as apple_music_router

app.include_router(apple_music_router)


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


async def chat_stream_generator(message: str, session_id: str, user_id: str):
    """
    Generate streaming chat responses with proper database connection lifecycle.

    This generator creates and manages its own database session to ensure
    connections are properly closed even if the client disconnects.
    """
    from apps.backend.agent import run_agent_stream
    from apps.backend.database import AsyncSessionLocal
    import json

    # Create dedicated database session for this streaming request
    db = AsyncSessionLocal()

    try:
        async for chunk in run_agent_stream(db, message, session_id, user_id):
            # Send each chunk as Server-Sent Event
            yield f"data: {json.dumps(chunk)}\n\n"
    except Exception as e:
        import traceback
        traceback.print_exc()
        error_chunk = {"content": "Sorry, I had a technical difficulty. Try again? 🎧", "done": True, "error": str(e)}
        yield f"data: {json.dumps(error_chunk)}\n\n"
    finally:
        # Ensure database connection is properly closed
        await db.close()


@app.post("/chat")
async def chat(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    """Chat with the music agent. Creates session if session_id is None. Supports streaming."""
    import uuid

    # Validate required fields
    if not request.user_id:
        raise HTTPException(400, "user_id is required")

    # Generate new session_id if not provided (delayed creation)
    session_id = request.session_id
    if not session_id:
        session_id = str(uuid.uuid4())
        print(f"Generated new session ID for delayed creation: {session_id}")

    # Always use streaming response
    return StreamingResponse(
        chat_stream_generator(request.message, session_id, request.user_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@app.get("/state", response_model=StateResponse)
async def get_state(session_id: Optional[str] = None, user_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """Get current session state."""
    from apps.backend.state import store

    # Return empty state if no session_id
    if not session_id:
         return StateResponse(session_id="default")

    # Get session (returns None if not exists)
    session = await store.get_session(db, session_id, user_id) if user_id else None

    # If session not found, return empty state
    if not session:
        return StateResponse(session_id=session_id)

    return StateResponse(
        session_id=session.session_id,
        current_track=session.current_track.model_dump() if session.current_track else None,
        playlist=[t.model_dump() for t in session.playlist],
        is_playing=session.is_playing,
        playback_position=session.playback_position,
        chat_history=[
            {"role": m.role, "content": m.content, "timestamp": m.timestamp.isoformat()}
            for m in session.chat_history[-20:]  # Last 20 messages
        ]
    )


@app.post("/state/sync")
async def sync_state(request: SyncRequest, db: AsyncSession = Depends(get_db)):
    """Sync frontend state to backend."""
    from apps.backend.state import store, TrackInfo
    from datetime import datetime

    if not request.session_id:
         return {"error": "Session ID required"}

    # 1. Fetch existing session (use user_id if provided)
    session = await store.get_session(db, request.session_id, user_id=request.user_id)

    # If no session exists, skip sync silently
    if not session:
        return {"status": "no_session", "session_id": request.session_id}

    # 2. Update fields from request
    if request.current_track:
        session.current_track = TrackInfo(**request.current_track)
    if request.playlist is not None:
        session.playlist = [TrackInfo(**t) for t in request.playlist]
    if request.is_playing is not None:
        session.is_playing = request.is_playing
    if request.playback_position is not None:
        session.playback_position = request.playback_position

    session.last_sync = datetime.now()

    # 3. Persist (require user_id for permission check)
    if not request.user_id:
        return {"error": "user_id required for sync"}

    await store.update_session(db, session, request.user_id)

    return {
        "status": "synced",
        "session_id": session.session_id,
        "last_sync": session.last_sync.isoformat()
    }


class CreateSessionRequest(BaseModel):
    user_id: str


@app.post("/session/create")
async def create_session(request: CreateSessionRequest, db: AsyncSession = Depends(get_db)):
    """Create a new empty session and return the session_id."""
    import uuid
    from apps.backend.state import store

    if not request.user_id:
        raise HTTPException(400, "user_id is required")

    # Generate new session ID
    session_id = str(uuid.uuid4())

    # Create session in database
    session = await store.create_session(db, session_id, request.user_id)

    return {
        "session_id": session.session_id
    }


@app.post("/action/{action}")
async def execute_action(action: str, index: Optional[int] = None, query: Optional[str] = None, session_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """Execute a direct action (play, pause, skip, etc.)."""
    from apps.backend.state import store
    
    if not session_id:
        return {"error": "Session ID required"}
        
    session = await store.get_session(db, session_id)
    
    if action == "play" and index is not None:
        if 0 <= index < len(session.playlist):
            track = session.playlist[index]
            return {"action": "play", "index": index, "track": track.model_dump()}
        return {"error": "Invalid index"}
    
    elif action == "skip_next":
        if session.current_track and session.playlist:
            current_idx = next(
                (i for i, t in enumerate(session.playlist) if t.id == session.current_track.id),
                -1
            )
            next_idx = current_idx + 1
            if next_idx < len(session.playlist):
                return {"action": "play", "index": next_idx}
        return {"action": "play", "index": 0}
    
    elif action == "skip_prev":
        if session.current_track and session.playlist:
            current_idx = next(
                (i for i, t in enumerate(session.playlist) if t.id == session.current_track.id),
                0
            )
            prev_idx = max(0, current_idx - 1)
            return {"action": "play", "index": prev_idx}
        return {"action": "play", "index": 0}
    
    return {"error": f"Unknown action: {action}"}

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

class CreateConversationRequest(BaseModel):
    user_id: str

class CreateConversationResponse(BaseModel):
    conversation_id: str
    created_at: str

@app.post("/conversations/create", response_model=CreateConversationResponse)
async def create_conversation(
    request: CreateConversationRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new empty conversation.
    Returns the new conversation ID immediately.
    """
    from apps.backend.state import store
    import uuid
    import traceback

    print(f"Creating conversation for user: {request.user_id}")

    try:
        user_uuid = uuid.UUID(request.user_id)
    except ValueError as e:
        print(f"Invalid user_id format: {request.user_id}")
        raise HTTPException(400, f"Invalid user_id format: {str(e)}")

    try:
        # Generate new conversation ID
        new_conversation_id = str(uuid.uuid4())
        print(f"Generated conversation ID: {new_conversation_id}")

        # Create the conversation in database
        await store.create_session(db, new_conversation_id, request.user_id)
        print(f"Successfully created conversation: {new_conversation_id}")

        return CreateConversationResponse(
            conversation_id=new_conversation_id,
            created_at=datetime.now().isoformat()
        )
    except Exception as e:
        traceback.print_exc()
        print(f"Error creating conversation: {e}")
        raise HTTPException(500, f"Failed to create conversation: {str(e)}")

@app.get("/conversations", response_model=ConversationsResponse)
async def list_conversations(
    user_id: str,  # Required: user ID from auth header or query param
    db: AsyncSession = Depends(get_db)
):
    """
    List user's conversations with metadata.
    Returns conversations sorted by pinned status then updated_at.
    """
    from sqlalchemy import select
    from apps.backend.models import Conversation
    import uuid

    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(400, "Invalid user_id format")

    # Query conversations with permission check
    stmt = (
        select(Conversation)
        .where(
            Conversation.user_id == user_uuid,
            Conversation.is_archived == False
        )
        .order_by(
            Conversation.is_pinned.desc(),
            Conversation.updated_at.desc()
        )
        .limit(50)
    )
    result = await db.execute(stmt)
    convs = result.scalars().all()

    return ConversationsResponse(
        conversations=[
            ConversationItem(
                id=str(c.id),
                title=c.title,  # Can be None if not yet generated
                message_count=c.message_count or 0,
                last_message_preview=c.last_message_preview,
                last_message_at=c.last_message_at.isoformat() if c.last_message_at else None,
                is_pinned=c.is_pinned or False,
                updated_at=c.updated_at.isoformat() if c.updated_at else ""
            ) for c in convs
        ]
    )


@app.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    user_id: str,  # Required: user ID for permission check
    db: AsyncSession = Depends(get_db)
):
    """
    Delete a conversation (with permission check).
    Only the owner can delete their conversations.
    """
    from sqlalchemy import delete, select
    from apps.backend.models import Conversation, ConversationState
    import uuid

    try:
        conv_uuid = uuid.UUID(conversation_id)
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(400, "Invalid ID format")

    # Verify conversation exists and belongs to user
    stmt = select(Conversation).where(
        Conversation.id == conv_uuid,
        Conversation.user_id == user_uuid
    )
    result = await db.execute(stmt)
    conv = result.scalar_one_or_none()

    if not conv:
        raise HTTPException(404, "Conversation not found or access denied")

    # Delete conversation state first (foreign key constraint)
    await db.execute(delete(ConversationState).where(ConversationState.conversation_id == conv_uuid))
    # Delete conversation
    await db.execute(delete(Conversation).where(Conversation.id == conv_uuid))
    await db.commit()

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
    db: AsyncSession = Depends(get_db)
):
    """
    Update conversation metadata (title, pinned, archived).
    Only the owner can update their conversations.
    """
    from sqlalchemy import select, update
    from apps.backend.models import Conversation
    import uuid

    try:
        conv_uuid = uuid.UUID(conversation_id)
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(400, "Invalid ID format")

    # Verify conversation exists and belongs to user
    stmt = select(Conversation).where(
        Conversation.id == conv_uuid,
        Conversation.user_id == user_uuid
    )
    result = await db.execute(stmt)
    conv = result.scalar_one_or_none()

    if not conv:
        raise HTTPException(404, "Conversation not found or access denied")

    # Build update dict from provided fields
    update_values = {}
    if update_data.title is not None:
        update_values['title'] = update_data.title
    if update_data.is_pinned is not None:
        update_values['is_pinned'] = update_data.is_pinned
    if update_data.is_archived is not None:
        update_values['is_archived'] = update_data.is_archived

    if not update_values:
        raise HTTPException(400, "No fields to update")

    # Apply updates
    update_stmt = (
        update(Conversation)
        .where(Conversation.id == conv_uuid)
        .values(**update_values)
    )
    await db.execute(update_stmt)
    await db.commit()

    return {"success": True, "updated": conversation_id, "fields": list(update_values.keys())}



# Health check
@app.get("/health")
def health():
    return {"status": "healthy"}
