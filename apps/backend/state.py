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
    """A chat message with support for multi-part content (text, thinking, tool_calls)."""
    role: str  # 'user' or 'agent'
    content: Optional[str] = None  # For backward compatibility (simple text)
    parts: Optional[list[dict]] = None  # New format: [{type, content/tool_name/args/etc}]
    timestamp: datetime = Field(default_factory=datetime.now)

    def to_frontend_format(self) -> dict:
        """Convert to frontend-compatible format."""
        if self.parts:
            return {"role": self.role, "parts": self.parts}
        else:
            # Backward compatibility
            return {"role": self.role, "content": self.content}


class SessionState(BaseModel):
    """Complete session state for a user."""
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    chat_history: list[Message] = Field(default_factory=list)
    current_track: Optional[TrackInfo] = None
    playlist: list[TrackInfo] = Field(default_factory=list)
    is_playing: bool = False
    playback_position: float = 0.0  # seconds
    last_sync: datetime = Field(default_factory=datetime.now)

    def add_message(self, role: str, content: str = None, parts: list[dict] = None):
        """Add a message to chat history.

        Args:
            role: 'user' or 'agent'
            content: Simple text content (for backward compatibility)
            parts: Multi-part message structure (new format)
        """
        self.chat_history.append(Message(role=role, content=content, parts=parts))

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


import logging
import time
from datetime import datetime

from .supabase_client import get_supabase
from .title_generator import generate_conversation_title

log = logging.getLogger("playhead.state")


class SessionStore:
    """Supabase REST API backed session store."""

    async def get_session(self, db, session_id: str, user_id: Optional[str] = None) -> Optional[SessionState]:
        """Get existing session from DB via Supabase REST. `db` param kept for API compat but unused."""
        t0 = time.perf_counter()
        try:
            try:
                uuid.UUID(session_id)
            except (ValueError, TypeError):
                return None

            sb = await get_supabase()

            # Check conversation ownership
            if user_id:
                try:
                    uuid.UUID(user_id)
                except (ValueError, TypeError):
                    return None
                conv = await sb.table("conversations").select("id").eq("id", session_id).eq("user_id", user_id).maybe_single().execute()
            else:
                conv = await sb.table("conversations").select("id").eq("id", session_id).maybe_single().execute()

            if not conv.data:
                log.info("⏱ get_session: %.0fms (not found - no conversation)", (time.perf_counter() - t0) * 1000)
                return None

            # Get conversation state
            state = await sb.table("conversation_states").select("messages,context,last_synced_at").eq("conversation_id", session_id).maybe_single().execute()
            log.info("⏱ get_session: %.0fms (found=%s)", (time.perf_counter() - t0) * 1000, state.data is not None)

            if not state.data:
                return None

            return self._hydrate(state.data, session_id)
        except Exception as e:
            log.error("Error getting session %s: %s (%.0fms)", session_id[:8], e, (time.perf_counter() - t0) * 1000)
            return None

    async def create_session(self, db, session_id: str, user_id: str) -> SessionState:
        """Create new session via Supabase REST. `db` param kept for API compat but unused."""
        t0 = time.perf_counter()
        try:
            sb = await get_supabase()

            # Upsert conversation
            await sb.table("conversations").upsert({
                "id": session_id,
                "user_id": user_id,
                "title": None,
                "message_count": 0,
            }, on_conflict="id").execute()

            # Upsert conversation state
            await sb.table("conversation_states").upsert({
                "conversation_id": session_id,
                "messages": [],
                "context": {},
            }, on_conflict="conversation_id").execute()

            log.info("⏱ create_session: %.0fms", (time.perf_counter() - t0) * 1000)
            return SessionState(session_id=session_id, last_sync=datetime.now())
        except Exception as e:
            log.error("Error creating session %s: %s (%.0fms)", session_id[:8], e, (time.perf_counter() - t0) * 1000)
            session = await self.get_session(None, session_id, user_id)
            if session:
                return session
            raise

    def _hydrate(self, data: dict, session_id: str) -> SessionState:
        """Convert Supabase row dict to SessionState."""
        context = data.get("context") or {}

        current_track = None
        if context.get("current_track"):
            current_track = TrackInfo(**context["current_track"])

        playlist = []
        if context.get("playlist"):
            playlist = [TrackInfo(**t) for t in context["playlist"]]

        chat_history = []
        if data.get("messages"):
            for m in data["messages"]:
                chat_history.append(Message(**m))

        return SessionState(
            session_id=session_id,
            chat_history=chat_history,
            current_track=current_track,
            playlist=playlist,
            is_playing=context.get("is_playing", False),
            playback_position=context.get("playback_position", 0.0),
            last_sync=data.get("last_synced_at") or datetime.now()
        )

    async def update_session(self, db, state: SessionState, user_id: str):
        """Persist chat messages and conversation metadata via Supabase REST.
        `db` param kept for API compat but unused.

        Does NOT write the context column — owned by frontend via /state/sync.
        """
        t0 = time.perf_counter()
        messages_data = [m.model_dump(mode='json') for m in state.chat_history]

        message_count = len(state.chat_history)
        last_message_preview = None
        last_message_at = None

        if state.chat_history:
            last_msg = state.chat_history[-1]
            if last_msg.content:
                last_message_preview = last_msg.content[:100]
            elif last_msg.parts:
                text_parts = [p.get("content", "") for p in last_msg.parts if p.get("type") == "text"]
                combined_text = "".join(text_parts)
                last_message_preview = combined_text[:100] if combined_text else "..."
            else:
                last_message_preview = "..."
            last_message_at = last_msg.timestamp.isoformat()

        try:
            sb = await get_supabase()
            now = datetime.now().isoformat()

            # Update conversation_states (messages only, not context)
            await sb.table("conversation_states").update({
                "messages": messages_data,
                "last_synced_at": now,
            }).eq("conversation_id", state.session_id).execute()

            # Update conversation metadata
            await sb.table("conversations").update({
                "message_count": message_count,
                "last_message_preview": last_message_preview,
                "last_message_at": last_message_at,
                "updated_at": now,
            }).eq("id", state.session_id).execute()

            log.info("⏱ update_session: %.0fms (%d msgs)", (time.perf_counter() - t0) * 1000, len(messages_data))
        except Exception as e:
            log.error("Failed to update session %s: %s (%.0fms)", state.session_id[:8], e, (time.perf_counter() - t0) * 1000, exc_info=True)
            raise

        # Generate title asynchronously if needed
        should_generate_title = (message_count == 2 or message_count % 10 == 0)
        if should_generate_title:
            import asyncio
            asyncio.create_task(self._generate_and_update_title(state.session_id, messages_data, message_count))

    async def _generate_and_update_title(self, session_id: str, messages_data: list, message_count: int):
        """Background task to generate and update conversation title."""
        try:
            title = await generate_conversation_title(messages_data)
            log.info("Generated title: %s", title)

            sb = await get_supabase()
            await sb.table("conversations").update({"title": title}).eq("id", session_id).execute()
        except Exception as e:
            log.warning("Background title generation failed: %s", e)
            if message_count == 2:
                try:
                    sb = await get_supabase()
                    await sb.table("conversations").update({"title": "New Conversation"}).eq("id", session_id).execute()
                except Exception as fallback_error:
                    log.warning("Failed to set default title: %s", fallback_error)


# Initialize store
store = SessionStore()
