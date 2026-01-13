"""
Music Agent API
"""
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
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


# =============================================================================
# Request/Response Models
# =============================================================================

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    # Add user_id if authenticated, or we can get it from headers/token later
    user_id: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    actions: list[str] = []
    session_id: str
    audio: Optional[str] = None


class SyncRequest(BaseModel):
    session_id: Optional[str] = None
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


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    """Chat with the music agent."""
    try:
        from apps.backend.agent import run_agent
        
        # Determine session ID strategy
        # Ideally, authenticated user -> specific conversation
        # Unauthenticated -> anon session not persisted long term or restricted
        # For now, we trust the client session_id or create new
        # We also need a way to pass user_id for RLS/persistence ownership
        
        # Use provided session_id or 'default' (safe fallback if no auth yet)
        sid = request.session_id
        if not sid:
            # We need a valid UUID for DB if using DB
            # But the client usually generates one or we do
            # Let's handle this in run_agent logic or generate here
            import uuid
            sid = str(uuid.uuid4())
            
        result = await run_agent(db, request.message, sid, request.user_id)
        
        # Integrate Minimax TTS
        audio_hex = None
        try:
            from apps.backend.minimax_client import minimax_client
            if result["response"]:
                 audio_hex = await minimax_client.generate_speech(result["response"])
        except Exception as e:
            print(f"TTS generation failed: {e}")

        return ChatResponse(
            response=result["response"],
            actions=result.get("actions", []),
            session_id=result["session_id"],
            audio=audio_hex
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Chat endpoint error: {e}")
        return ChatResponse(
            response="Sorry, I'm having technical difficulties. Try again in a moment! 🎧",
            actions=[],
            session_id=request.session_id or "default"
        )


@app.get("/state", response_model=StateResponse)
async def get_state(session_id: Optional[str] = None, user_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """Get current session state."""
    from apps.backend.state import store
    
    # Needs valid UUID handling
    if not session_id:
         # Return empty/default state if no ID
         # Or error?
         return StateResponse(session_id="default")

    session = await store.get_session(db, session_id, user_id)
    
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

    # 1. Fetch existing session
    session = await store.get_session(db, request.session_id)

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
    
    # 3. Persist
    await store.update_session(db, session)
    
    return {
        "status": "synced",
        "session_id": session.session_id,
        "last_sync": session.last_sync.isoformat()
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
    title: str
    updated_at: str

class ConversationsResponse(BaseModel):
    conversations: list[ConversationItem]

@app.get("/conversations", response_model=ConversationsResponse)
async def list_conversations(db: AsyncSession = Depends(get_db)):
    """List all conversations."""
    from sqlalchemy import select
    from apps.backend.models import Conversation
    
    stmt = select(Conversation).order_by(Conversation.updated_at.desc()).limit(20)
    result = await db.execute(stmt)
    convs = result.scalars().all()
    
    return ConversationsResponse(
        conversations=[
            ConversationItem(
                id=str(c.id), 
                title=c.title or "Untitled Chat",
                updated_at=c.updated_at.isoformat() if c.updated_at else ""
            ) for c in convs
        ]
    )


@app.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a conversation and its state."""
    from sqlalchemy import delete
    from apps.backend.models import Conversation, ConversationState
    import uuid
    
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        return {"error": "Invalid conversation ID"}
    
    # Delete conversation state first (foreign key)
    await db.execute(delete(ConversationState).where(ConversationState.conversation_id == conv_uuid))
    # Delete conversation
    await db.execute(delete(Conversation).where(Conversation.id == conv_uuid))
    await db.commit()
    
    return {"success": True, "deleted": conversation_id}


# Health check
@app.get("/health")
def health():
    return {"status": "healthy"}
