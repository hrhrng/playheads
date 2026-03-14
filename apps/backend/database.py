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
# Also strip ?pgbouncer=true — asyncpg doesn't understand it
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

DATABASE_URL = DATABASE_URL_RAW
_parsed = urlparse(DATABASE_URL)
_params = parse_qs(_parsed.query)
_params.pop("pgbouncer", None)
DATABASE_URL = urlunparse(_parsed._replace(query=urlencode(_params, doseq=True)))

if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Create Async Engine — use a small client-side pool to reuse TCP+SSL connections.
# Supabase Supavisor handles server-side pooling, but NullPool was causing every
# request to open a new TCP+SSL connection (~2-4s overhead each time).
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_size=3,
    max_overflow=2,
    pool_timeout=10,
    pool_recycle=300,       # Recycle connections every 5 min to avoid stale conns
    pool_pre_ping=True,     # Verify connection is alive before using it
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


async def warmup_pool():
    """Pre-create DB connections so the first user request doesn't pay TCP+SSL cost."""
    import logging
    import time
    from sqlalchemy import text
    log = logging.getLogger("playhead")
    t0 = time.perf_counter()
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    log.info("⏱ DB pool warmup: %.0fms", (time.perf_counter() - t0) * 1000)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
