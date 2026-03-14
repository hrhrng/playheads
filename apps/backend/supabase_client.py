"""
Supabase REST API client — replaces direct PostgreSQL for app queries.

Uses HTTP (PostgREST) instead of TCP+SSL PostgreSQL connections,
eliminating the ~6s connection overhead from Cloudflare containers.
"""
import logging
import os
import time

from supabase._async.client import AsyncClient, create_client

log = logging.getLogger("playhead.supabase")

_client: AsyncClient | None = None


async def get_supabase() -> AsyncClient:
    """Get or create singleton async Supabase client."""
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_KEY"]
        t0 = time.perf_counter()
        _client = await create_client(url, key)
        log.info("⏱ Supabase client init: %.0fms", (time.perf_counter() - t0) * 1000)
    return _client
