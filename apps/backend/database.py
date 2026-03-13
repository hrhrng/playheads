from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
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

# Create Async Engine with PostgreSQL settings
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True,
    future=True,
    connect_args={
        "ssl": "require",
        "statement_cache_size": 0,
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
