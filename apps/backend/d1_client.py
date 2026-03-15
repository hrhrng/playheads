"""
Cloudflare D1 REST API client for Python backend.

Accesses D1 via the Cloudflare API:
POST https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}/query

Only LangGraph checkpoint stays on Supabase PostgreSQL.
Everything else (conversations, profiles, waitlist) is in D1.
"""
import logging
import os
from typing import Any

import httpx

log = logging.getLogger("playhead.d1")

_BASE = "https://api.cloudflare.com/client/v4"


def _config() -> tuple[str, str, str]:
    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    api_token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    db_id = os.environ.get("D1_DATABASE_ID", "")
    if not account_id or not api_token or not db_id:
        raise RuntimeError(f"D1 credentials missing: account_id={'set' if account_id else 'MISSING'}, api_token={'set' if api_token else 'MISSING'}, db_id={'set' if db_id else 'MISSING'}")
    return account_id, api_token, db_id


async def query(sql: str, params: list[Any] | None = None) -> list[dict]:
    """Execute a D1 SQL query and return rows."""
    account_id, api_token, db_id = _config()
    url = f"{_BASE}/accounts/{account_id}/d1/database/{db_id}/query"

    body: dict[str, Any] = {"sql": sql}
    if params:
        body["params"] = params

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {api_token}",
                "Content-Type": "application/json",
            },
            json=body,
        )

    if resp.status_code >= 400:
        log.error("D1 query failed (%d): %s", resp.status_code, resp.text)
        raise RuntimeError(f"D1 query failed: {resp.status_code} {resp.text}")

    data = resp.json()
    if not data.get("success"):
        errors = data.get("errors", [])
        log.error("D1 query error: %s", errors)
        raise RuntimeError(f"D1 query error: {errors}")

    results = data.get("result", [])
    if results and "results" in results[0]:
        return results[0]["results"]
    return []


async def execute(sql: str, params: list[Any] | None = None) -> int:
    """Execute a D1 SQL statement (INSERT/UPDATE/DELETE). Returns rows affected."""
    account_id, api_token, db_id = _config()
    url = f"{_BASE}/accounts/{account_id}/d1/database/{db_id}/query"

    body: dict[str, Any] = {"sql": sql}
    if params:
        body["params"] = params

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {api_token}",
                "Content-Type": "application/json",
            },
            json=body,
        )

    if resp.status_code >= 400:
        log.error("D1 execute failed (%d): %s", resp.status_code, resp.text)
        raise RuntimeError(f"D1 execute failed: {resp.status_code} {resp.text}")

    data = resp.json()
    if not data.get("success"):
        errors = data.get("errors", [])
        raise RuntimeError(f"D1 execute error: {errors}")

    results = data.get("result", [])
    if results and "meta" in results[0]:
        return results[0]["meta"].get("changes", 0)
    return 0
