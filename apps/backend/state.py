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


from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from .models import Conversation, ConversationState, Profile
from .database import AsyncSessionLocal
from .title_generator import generate_conversation_title
from datetime import datetime
import json

class SessionStore:
    """Database-backed session store with intelligent session lifecycle management."""

    def __init__(self):
        pass

    async def get_session(self, db: AsyncSession, session_id: str, user_id: Optional[str] = None) -> Optional[SessionState]:
        """
        Get existing session from DB. Returns None if not exists.
        Does NOT create new session - use create_session() for that.

        Args:
            db: Database session
            session_id: Conversation UUID
            user_id: User UUID (for permission check). If None, skips permission check.

        Returns:
            SessionState if found, None otherwise
        """
        try:
            # Validate session_id is a valid UUID
            try:
                session_uuid = uuid.UUID(session_id)
            except (ValueError, TypeError):
                return None

            # Build query - with or without user_id check
            if user_id:
                try:
                    user_uuid = uuid.UUID(user_id)
                except (ValueError, TypeError):
                    return None

                stmt = (
                    select(ConversationState)
                    .join(Conversation)
                    .where(
                        Conversation.id == session_uuid,
                        Conversation.user_id == user_uuid
                    )
                )
            else:
                # No user_id - query without permission check (for sync endpoint)
                stmt = (
                    select(ConversationState)
                    .join(Conversation)
                    .where(Conversation.id == session_uuid)
                )

            result = await db.execute(stmt)
            db_state = result.scalar_one_or_none()

            if db_state:
                return self._hydrate_session(db_state, session_id)

            return None
        except Exception as e:
            print(f"Error getting session: {e}")
            return None

    async def create_session(self, db: AsyncSession, session_id: str, user_id: str) -> SessionState:
        """
        Create new session or get existing one (robust get_or_create pattern).

        Args:
            db: Database session
            session_id: Conversation UUID (generated by frontend)
            user_id: User UUID

        Returns:
            SessionState (new or existing)
        """
        try:
            session_uuid = uuid.UUID(session_id)
            user_uuid = uuid.UUID(user_id)

            # 1. Ensure Conversation exists (ignore conflict if already exists)
            stmt = insert(Conversation).values(
                id=session_uuid,
                user_id=user_uuid,
                title=None,
                message_count=0
            ).on_conflict_do_nothing(index_elements=['id'])

            await db.execute(stmt)
            await db.commit()

            # 2. Ensure ConversationState exists (ignore conflict if already exists)
            state_stmt = insert(ConversationState).values(
                conversation_id=session_uuid,
                messages=[],
                context={}
            ).on_conflict_do_nothing(index_elements=['conversation_id'])

            await db.execute(state_stmt)
            await db.commit()

            # 3. Retrieve the session (now guaranteed to exist)
            session = await self.get_session(db, session_id, user_id)
            if not session:
                # Should not happen unless deleted immediately
                raise ValueError("Failed to retrieve created session")

            return session

        except Exception as e:
            await db.rollback()
            print(f"Error creating session: {e}")
            # Try to recover by just getting it
            session = await self.get_session(db, session_id, user_id)
            if session:
                return session
            raise

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

    async def update_session(self, db: AsyncSession, state: SessionState, user_id: str):
        """
        Update session state in DB and automatically update Conversation metadata.
        Triggers title generation on first message or every 5 messages.

        Args:
            db: Database session
            state: SessionState to persist
            user_id: User UUID for permission check
        """
        # from sqlalchemy.dialects.postgresql import insert  <-- Removed local import

        session_uuid = uuid.UUID(state.session_id)

        print(f"[DEBUG update_session] Session ID: {state.session_id}")
        print(f"[DEBUG update_session] Chat history length: {len(state.chat_history)}")

        # Prepare conversation state data
        messages_data = [m.model_dump(mode='json') for m in state.chat_history]
        print(f"[DEBUG update_session] Serialized {len(messages_data)} messages")

        # Debug: Show last message structure
        if messages_data:
            last_msg = messages_data[-1]
            print(f"[DEBUG update_session] Last message: role={last_msg.get('role')}, has_parts={bool(last_msg.get('parts'))}, has_content={bool(last_msg.get('content'))}")
            if last_msg.get('parts'):
                import json
                print(f"[DEBUG update_session] Last message parts structure: {json.dumps(last_msg.get('parts'), indent=2)[:500]}...")

        context = {
            "is_playing": state.is_playing,
            "playback_position": state.playback_position,
            "current_track": state.current_track.model_dump(mode='json') if state.current_track else None,
            "playlist": [t.model_dump(mode='json') for t in state.playlist]
        }

        # Calculate metadata
        message_count = len(state.chat_history)
        last_message_preview = None
        last_message_at = None

        if state.chat_history:
            # Get last user or agent message for preview
            last_msg = state.chat_history[-1]

            # Extract preview text (handle both old and new format)
            if last_msg.content:
                last_message_preview = last_msg.content[:100]
            elif last_msg.parts:
                # Extract text from parts
                text_parts = [p.get("content", "") for p in last_msg.parts if p.get("type") == "text"]
                combined_text = "".join(text_parts)
                last_message_preview = combined_text[:100] if combined_text else "..."
            else:
                last_message_preview = "..."

            last_message_at = last_msg.timestamp

        # Upsert conversation state
        print(f"[DEBUG update_session] Upserting conversation state...")
        try:
            stmt = insert(ConversationState).values(
                conversation_id=session_uuid,
                messages=messages_data,
                context=context,
                last_synced_at=datetime.now()
            ).on_conflict_do_update(
                index_elements=['conversation_id'],
                set_={
                    'messages': messages_data,
                    'context': context,
                    'last_synced_at': datetime.now()
                }
            )
            await db.execute(stmt)
            print(f"[DEBUG update_session] ConversationState upsert executed")

            # Update Conversation metadata
            update_values = {
                'message_count': message_count,
                'last_message_preview': last_message_preview,
                'last_message_at': last_message_at,
                'updated_at': datetime.now()
            }

            print(f"[DEBUG update_session] Updating Conversation metadata: message_count={message_count}, preview='{last_message_preview[:50] if last_message_preview else None}'")

            # Apply updates to Conversation (without title first)
            conv_update_stmt = (
                update(Conversation)
                .where(Conversation.id == session_uuid)
                .values(**update_values)
            )
            await db.execute(conv_update_stmt)
            print(f"[DEBUG update_session] Conversation update executed")

            await db.commit()
            print(f"[DEBUG update_session] Database commit successful")
        except Exception as e:
            print(f"[ERROR update_session] Database operation failed: {e}")
            import traceback
            traceback.print_exc()
            raise

        # Generate title asynchronously if needed (don't block)
        should_generate_title = (message_count == 2 or message_count % 10 == 0)  # 2 because we have user + agent

        if should_generate_title:
            import asyncio
            # Create background task for title generation (fire and forget)
            asyncio.create_task(self._generate_and_update_title(session_uuid, messages_data, message_count))

    async def _generate_and_update_title(self, session_uuid: uuid.UUID, messages_data: list, message_count: int):
        """
        Background task to generate and update conversation title.
        Runs asynchronously without blocking the main response flow.
        """
        try:
            # Generate title
            title = await generate_conversation_title(messages_data)
            print(f"Generated title asynchronously: {title}")

            # Update in database with new connection
            async with AsyncSessionLocal() as db:
                update_stmt = (
                    update(Conversation)
                    .where(Conversation.id == session_uuid)
                    .values(title=title)
                )
                await db.execute(update_stmt)
                await db.commit()

        except Exception as e:
            print(f"Background title generation failed: {e}")
            # Set default title for first message
            if message_count == 2:
                try:
                    async with AsyncSessionLocal() as db:
                        update_stmt = (
                            update(Conversation)
                            .where(Conversation.id == session_uuid)
                            .values(title="New Conversation")
                        )
                        await db.execute(update_stmt)
                        await db.commit()
                except Exception as fallback_error:
                    print(f"Failed to set default title: {fallback_error}")

# Initialize store (stateless wrapper now)
store = SessionStore()
