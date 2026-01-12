from sqlalchemy import Column, String, ForeignKey, DateTime, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from .database import Base

class Profile(Base):
    __tablename__ = "profiles"

    id = Column(UUID(as_uuid=True), primary_key=True)  # References auth.users(id)
    display_name = Column(Text, nullable=True)
    avatar_url = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    conversations = relationship("Conversation", back_populates="user", cascade="all, delete-orphan")

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    title = Column(Text, default="New Conversation")
    metadata_ = Column("metadata", JSONB, default={})  # 'metadata' is reserved in SQLAlchemy Base
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("Profile", back_populates="conversations")
    state = relationship("ConversationState", back_populates="conversation", uselist=False, cascade="all, delete-orphan")

class ConversationState(Base):
    __tablename__ = "conversation_states"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), unique=True, nullable=False)
    messages = Column(JSONB, default=[])
    context = Column(JSONB, default={})
    last_synced_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    conversation = relationship("Conversation", back_populates="state")
