from sqlalchemy import Column, String, ForeignKey, DateTime, Text, Boolean, Integer, Index, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

try:
    from .database import Base
except ImportError:
    from database import Base

class Profile(Base):
    __tablename__ = "profiles"

    # Use UUID type for PostgreSQL
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    display_name = Column(Text, nullable=True)
    avatar_url = Column(Text, nullable=True)
    apple_music_token = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    conversations = relationship("Conversation", back_populates="user", cascade="all, delete-orphan")

class Conversation(Base):
    __tablename__ = "conversations"

    # Use UUID type for PostgreSQL
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    title = Column(Text, nullable=True)

    # Metadata fields
    message_count = Column(Integer, default=0)
    last_message_preview = Column(Text, nullable=True)
    last_message_at = Column(DateTime(timezone=True), nullable=True)
    is_pinned = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False)

    metadata_ = Column("metadata", JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("Profile", back_populates="conversations")
    state = relationship("ConversationState", back_populates="conversation", uselist=False, cascade="all, delete-orphan")

# Indexes
Index('idx_conversations_user_updated', Conversation.user_id, Conversation.updated_at.desc())
Index('idx_conversations_user_pinned', Conversation.user_id, Conversation.is_pinned, Conversation.updated_at.desc())

class ConversationState(Base):
    __tablename__ = "conversation_states"

    # Use UUID type for PostgreSQL
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), unique=True, nullable=False)
    messages = Column(JSON, default=list)
    context = Column(JSON, default=dict)
    last_synced_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    conversation = relationship("Conversation", back_populates="state")
