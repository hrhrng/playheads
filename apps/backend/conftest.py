"""
Pytest configuration — ensure project root is in sys.path so that
`apps.backend.*` namespace imports resolve correctly (matching how
`uv run --package backend` sets up the path at runtime).
"""
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from dotenv import load_dotenv

# Load apps/backend/.env as the canonical API config for tests.
# override=True ensures .env values win over shell env vars — this prevents
# stale or wrong credentials (e.g. a different API proxy) from breaking tests.
_backend_dir = Path(__file__).resolve().parent
load_dotenv(_backend_dir / ".env", override=True)

# DATABASE_URL must be set before any import of apps.backend.database
# (which happens transitively via state.py → database.py).
# The engine is lazy-connect so this dummy URL never triggers real DB I/O.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/testdb")

# Project root = two levels up from apps/backend/
_project_root = str(Path(__file__).resolve().parent.parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)


# =============================================================================
# Canonical test data — reusable across test modules
# =============================================================================

# Canonical Apple Music track data — reusable across test modules
TAKE_FIVE_TRACK = {
    "id": "12345",
    "attributes": {
        "name": "Take Five",
        "artistName": "Dave Brubeck",
        "albumName": "Time Out",
        "artwork": {"url": "https://example.com/artwork.jpg"},
        "durationInMillis": 324000,
    },
}


# =============================================================================
# Shared fixtures
# =============================================================================

@pytest.fixture
def mock_apple_music():
    """Mock Apple Music API — handles both search and fetch-by-ID endpoints.

    Routes:
      - v1/catalog/us/search  → returns TAKE_FIVE_TRACK in search format
      - v1/catalog/us/songs/* → returns TAKE_FIVE_TRACK in catalog format
    """
    async def fake_get(path, params=None, user_token=None):
        if "search" in path:
            # Search endpoint: results → songs → data
            return {"results": {"songs": {"data": [TAKE_FIVE_TRACK]}}}
        else:
            # Catalog lookup by ID: data → [track]
            return {"data": [TAKE_FIVE_TRACK]}

    with patch("apps.backend.apple_music._apple_music_get", fake_get):
        yield


# =============================================================================
# API test fixtures — httpx client & mocked SessionStore
# =============================================================================

@pytest.fixture
async def api_client():
    """Async httpx client wired to the FastAPI app via ASGITransport.

    Overrides Depends(get_db) with a lightweight AsyncMock so that
    endpoint tests never touch a real database.
    """
    from httpx import ASGITransport, AsyncClient
    from apps.backend.main import app
    from apps.backend.database import get_db

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock()
    mock_db.commit = AsyncMock()
    mock_db.rollback = AsyncMock()
    mock_db.close = AsyncMock()

    app.dependency_overrides[get_db] = lambda: mock_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        # Expose the mock DB on the client for tests that need custom results
        client.mock_db = mock_db
        yield client

    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def mock_store():
    """Patch the global `store` object in apps.backend.state.

    Provides pre-wired AsyncMock methods for the three core operations:
      - get_session   → returns None by default
      - create_session → returns a default SessionState
      - update_session → no-op
    Tests can override return values via mock_store.<method>.return_value.
    """
    from apps.backend.state import SessionState

    with patch("apps.backend.state.store") as patched:
        patched.get_session = AsyncMock(return_value=None)
        patched.create_session = AsyncMock(
            side_effect=lambda db, sid, uid: SessionState(session_id=sid)
        )
        patched.update_session = AsyncMock()
        yield patched
