"""
Pytest configuration — ensure project root is in sys.path so that
`apps.backend.*` namespace imports resolve correctly (matching how
`uv run --package backend` sets up the path at runtime).
"""
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

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


@pytest.fixture
def mock_ddgs():
    """Mock DuckDuckGo search — returns canned jazz results for deterministic tests.

    Replaces the DDGS context manager used by the search_web tool so that
    tests never hit the real DuckDuckGo API.
    """
    canned_results = [
        {"title": "Top Jazz Albums", "body": "Take Five by Dave Brubeck is a timeless classic."},
        {"title": "Jazz Essentials", "body": "So What by Miles Davis, Blue Train by John Coltrane."},
    ]

    class FakeDDGS:
        """Minimal stand-in for duckduckgo_search.DDGS context manager."""
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def text(self, query, max_results=5):
            return canned_results

    with patch("apps.backend.agent.DDGS", FakeDDGS):
        yield
