"""
Music Agent API
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

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


class ChatResponse(BaseModel):
    response: str
    actions: list[str] = []
    session_id: str


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
def chat(request: ChatRequest):
    """Chat with the music agent."""
    try:
        from apps.backend.agent import run_agent
        result = run_agent(request.message, request.session_id)
        
        return ChatResponse(
            response=result["response"],
            actions=result.get("actions", []),
            session_id=result["session_id"]
        )
    except Exception as e:
        print(f"Chat endpoint error: {e}")
        return ChatResponse(
            response="Sorry, I'm having technical difficulties. Try again in a moment! 🎧",
            actions=[],
            session_id=request.session_id or "default"
        )


@app.get("/state", response_model=StateResponse)
def get_state(session_id: Optional[str] = None):
    """Get current session state."""
    from apps.backend.state import store
    
    session = store.get_session(session_id)
    
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
def sync_state(request: SyncRequest):
    """Sync frontend state to backend."""
    from apps.backend.state import store
    
    session = store.sync_from_frontend(
        session_id=request.session_id or "default",
        data=request.model_dump(exclude_none=True)
    )
    
    return {
        "status": "synced",
        "session_id": session.session_id,
        "last_sync": session.last_sync.isoformat()
    }


@app.post("/action/{action}")
def execute_action(action: str, index: Optional[int] = None, query: Optional[str] = None):
    """Execute a direct action (play, pause, skip, etc.)."""
    from apps.backend.state import store
    
    session = store.get_session()
    
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


# Health check
@app.get("/health")
def health():
    return {"status": "healthy"}
