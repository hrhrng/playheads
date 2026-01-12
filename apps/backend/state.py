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


class SessionStore:
    """In-memory session store. Can be replaced with Redis later."""
    
    def __init__(self):
        self._sessions: dict[str, SessionState] = {}
        self._default_session_id = "default"  # Single user mode for now
    
    def get_session(self, session_id: Optional[str] = None) -> SessionState:
        """Get or create a session."""
        sid = session_id or self._default_session_id
        if sid not in self._sessions:
            self._sessions[sid] = SessionState(session_id=sid)
        return self._sessions[sid]
    
    def update_session(self, state: SessionState):
        """Update a session."""
        state.last_sync = datetime.now()
        self._sessions[state.session_id] = state
    
    def sync_from_frontend(self, session_id: str, data: dict):
        """Sync state from frontend."""
        session = self.get_session(session_id)
        
        # Update current track
        if 'current_track' in data and data['current_track']:
            ct = data['current_track']
            session.current_track = TrackInfo(
                id=ct.get('id', ''),
                name=ct.get('name', 'Unknown'),
                artist=ct.get('artist', 'Unknown'),
                album=ct.get('album'),
                artwork_url=ct.get('artwork_url'),
                duration=ct.get('duration')
            )
        
        # Update playlist
        if 'playlist' in data:
            session.playlist = [
                TrackInfo(
                    id=t.get('id', ''),
                    name=t.get('name', 'Unknown'),
                    artist=t.get('artist', 'Unknown'),
                    album=t.get('album'),
                    artwork_url=t.get('artwork_url'),
                    duration=t.get('duration')
                )
                for t in data['playlist']
            ]
        
        # Update playback state
        if 'is_playing' in data:
            session.is_playing = data['is_playing']
        if 'playback_position' in data:
            session.playback_position = data['playback_position']
        
        session.last_sync = datetime.now()
        return session


# Global store instance
store = SessionStore()
