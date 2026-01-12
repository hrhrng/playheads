"""
Session State Management for Music Agent
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
import uuid


class TrackInfo(BaseModel):
    """Represents a music track."""
    id: str
    name: str
    artist: str
    album: Optional[str] = None
    artwork_url: Optional[str] = None
    duration: Optional[float] = None  # seconds


class Message(BaseModel):
    """A chat message."""
    role: str  # 'user' or 'agent'
    content: str
    timestamp: datetime = Field(default_factory=datetime.now)


class SessionState(BaseModel):
    """Complete session state for a user."""
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    chat_history: list[Message] = Field(default_factory=list)
    current_track: Optional[TrackInfo] = None
    playlist: list[TrackInfo] = Field(default_factory=list)
    is_playing: bool = False
    playback_position: float = 0.0  # seconds
    last_sync: datetime = Field(default_factory=datetime.now)
    
    def add_message(self, role: str, content: str):
        """Add a message to chat history."""
        self.chat_history.append(Message(role=role, content=content))
    
    def get_context_summary(self) -> str:
        """Generate a summary for LLM context."""
        lines = []
        
        if self.current_track:
            lines.append(f"Currently playing: {self.current_track.name} by {self.current_track.artist}")
        else:
            lines.append("Nothing is currently playing.")
        
        if self.playlist:
            lines.append(f"Playlist has {len(self.playlist)} tracks:")
            for i, track in enumerate(self.playlist[:5]):  # Show first 5
                lines.append(f"  {i+1}. {track.name} - {track.artist}")
            if len(self.playlist) > 5:
                lines.append(f"  ... and {len(self.playlist) - 5} more")
        else:
            lines.append("Playlist is empty.")
        
        return "\n".join(lines)


from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .models import Conversation, ConversationState, Profile
from .database import AsyncSessionLocal
import json

class SessionStore:
    """Database-backed session store."""
    
    def __init__(self):
        # We don't hold connections here; we get them per request
        pass
    
    async def get_session(self, db: AsyncSession, session_id: str, user_id: Optional[str] = None) -> SessionState:
        """Get session from DB or create new."""
        
        # 1. Try to find existing conversation state
        stmt = select(ConversationState).join(Conversation).where(Conversation.id == session_id)
        result = await db.execute(stmt)
        db_state = result.scalar_one_or_none()
        
        if db_state:
            # Rehydrate Pydantic model from DB
            return self._hydrate_session(db_state, session_id)
            
        # 2. If not found, create new conversation if user_id provided
        if user_id:
            # Check for existing recent conversation or create new
            # For simplicity, we create a new one if ID provided but not found
            # typically session_id comes from the client as the conversation ID
            
            # Create Conversation
            new_conv = Conversation(id=uuid.UUID(session_id), user_id=uuid.UUID(user_id))
            db.add(new_conv)
            await db.flush() # get ID
            
            # ConversationState is auto-created by DB trigger, but we might need to fetch it
            # Or we can manually create it if the trigger isn't reliable for async flow immediately
            # Let's rely on manual creation to be safe in app logic
            new_state = ConversationState(conversation_id=new_conv.id)
            db.add(new_state)
            await db.commit()
            
            return SessionState(session_id=str(new_conv.id))
            
        # Fallback for anon/testing (not persisted)
        return SessionState(session_id=session_id)

    def _hydrate_session(self, db_state: ConversationState, session_id: str) -> SessionState:
        """Convert DB model to Pydantic SessionState."""
        context = db_state.context or {}
        
        # Parse tracks from context
        current_track = None
        if context.get("current_track"):
            ct = context["current_track"]
            current_track = TrackInfo(**ct)
            
        playlist = []
        if context.get("playlist"):
            playlist = [TrackInfo(**t) for t in context["playlist"]]
            
        chat_history = []
        if db_state.messages:
            for m in db_state.messages:
                chat_history.append(Message(**m))
                
        return SessionState(
            session_id=session_id,
            chat_history=chat_history,
            current_track=current_track,
            playlist=playlist,
            is_playing=context.get("is_playing", False),
            playback_position=context.get("playback_position", 0.0),
            last_sync=db_state.last_synced_at or datetime.now()
        )

    async def update_session(self, db: AsyncSession, state: SessionState):
        """Update session state in DB."""
        stmt = select(ConversationState).where(ConversationState.conversation_id == uuid.UUID(state.session_id))
        result = await db.execute(stmt)
        db_state = result.scalar_one_or_none()
        
        if db_state:
            # Update fields
            db_state.messages = [m.model_dump(mode='json') for m in state.chat_history]
            
            # Update context
            context = {
                "is_playing": state.is_playing,
                "playback_position": state.playback_position,
                "current_track": state.current_track.model_dump(mode='json') if state.current_track else None,
                "playlist": [t.model_dump(mode='json') for t in state.playlist]
            }
            db_state.context = context
            db_state.last_synced_at = datetime.now()  # timezone aware?
            
            await db.commit()

# Initialize store (stateless wrapper now)
store = SessionStore()
