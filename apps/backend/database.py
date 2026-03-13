from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
import os
from typing import AsyncGenerator

# Use PostgreSQL - DATABASE_URL should be set in .env
DATABASE_URL_RAW = os.getenv("DATABASE_URL")
if not DATABASE_URL_RAW:
    raise ValueError("DATABASE_URL environment variable is required")

# Raw URL for psycopg (langgraph checkpointer) — must stay as postgresql://
# Append sslmode=require for Supabase if not already present
DATABASE_URL_PSYCOPG = DATABASE_URL_RAW
if "sslmode" not in DATABASE_URL_PSYCOPG:
    separator = "&" if "?" in DATABASE_URL_PSYCOPG else "?"
    DATABASE_URL_PSYCOPG = f"{DATABASE_URL_PSYCOPG}{separator}sslmode=require"

# SQLAlchemy needs the asyncpg driver prefix
DATABASE_URL = DATABASE_URL_RAW
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Create Async Engine — use NullPool since Supabase Supavisor handles pooling
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    poolclass=NullPool,
    connect_args={
        "ssl": "require",
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
    },
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)

class Base(DeclarativeBase):
    pass

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
