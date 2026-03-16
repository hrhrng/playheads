"""
API endpoint tests — exercises FastAPI routes via httpx.AsyncClient + ASGITransport.

No real server is started. DB dependency is overridden with a mock, and the
SessionStore is patched so tests stay fast, deterministic, and isolated.
"""
import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from apps.backend.main import app
from apps.backend.database import get_db
from apps.backend.state import SessionState, TrackInfo, Message


# =============================================================================
# Helpers
# =============================================================================

def _mock_db():
    """Lightweight async DB session stand-in — enough to satisfy Depends(get_db)."""
    db = AsyncMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.close = AsyncMock()
    return db


def _sample_session(session_id: str = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee") -> SessionState:
    """Build a realistic SessionState for endpoint assertions."""
    return SessionState(
        session_id=session_id,
        current_track=TrackInfo(
            id="t-1", name="Take Five", artist="Dave Brubeck", album="Time Out"
        ),
        playlist=[
            TrackInfo(id="t-1", name="Take Five", artist="Dave Brubeck"),
            TrackInfo(id="t-2", name="So What", artist="Miles Davis"),
        ],
        is_playing=True,
        playback_position=60.0,
        chat_history=[
            Message(role="user", content="Play some jazz"),
            Message(role="agent", content="Now playing Take Five!"),
        ],
    )


# =============================================================================
# Health & Root
# =============================================================================

class TestHealthAndRoot:
    """Smoke tests — these endpoints have no dependencies."""

    async def test_health(self):
        """GET /health should return status=healthy."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/health")

        assert resp.status_code == 200
        assert resp.json() == {"status": "healthy"}

    async def test_root(self):
        """GET / should return the API banner with status=running."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/")

        body = resp.json()
        assert resp.status_code == 200
        assert body["status"] == "running"
        assert "v2.0" in body["message"]


# =============================================================================
# GET /state
# =============================================================================

class TestGetState:
    """GET /state — returns session state or defaults."""

    async def test_no_session_id_returns_default(self):
        """Without session_id, the endpoint returns a default empty state."""
        mock_db = _mock_db()
        app.dependency_overrides[get_db] = lambda: mock_db

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/state")

            assert resp.status_code == 200
            assert resp.json()["session_id"] == "default"
        finally:
            app.dependency_overrides.pop(get_db, None)

    async def test_valid_session_returns_state(self):
        """With valid session_id + user_id, should return the hydrated session."""
        session_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        user_id = str(uuid.uuid4())
        session = _sample_session(session_id)

        mock_db = _mock_db()
        app.dependency_overrides[get_db] = lambda: mock_db

        try:
            with patch("apps.backend.state.store") as mock_store:
                mock_store.get_session = AsyncMock(return_value=session)

                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                    resp = await client.get("/state", params={"session_id": session_id, "user_id": user_id})

            assert resp.status_code == 200
            body = resp.json()
            assert body["session_id"] == session_id
            assert body["is_playing"] is True
            assert body["current_track"]["name"] == "Take Five"
            assert len(body["playlist"]) == 2
            assert len(body["chat_history"]) == 2
        finally:
            app.dependency_overrides.pop(get_db, None)

    async def test_session_not_found_returns_empty_state(self):
        """When store.get_session returns None, return empty default state."""
        session_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())

        mock_db = _mock_db()
        app.dependency_overrides[get_db] = lambda: mock_db

        try:
            with patch("apps.backend.state.store") as mock_store:
                mock_store.get_session = AsyncMock(return_value=None)

                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                    resp = await client.get("/state", params={"session_id": session_id, "user_id": user_id})

            assert resp.status_code == 200
            data = resp.json()
            assert data["session_id"] == session_id
            assert data["chat_history"] == []
            assert data["current_track"] is None
        finally:
            app.dependency_overrides.pop(get_db, None)


# =============================================================================
# POST /state/sync
# =============================================================================

class TestStateSync:
    """POST /state/sync — merges frontend playback state into the backend."""

    async def test_missing_session_id(self):
        """No session_id in body → error response (not 500)."""
        mock_db = _mock_db()
        app.dependency_overrides[get_db] = lambda: mock_db

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/state/sync", json={})

            assert resp.status_code == 200  # Endpoint returns 200 with error payload
            assert "error" in resp.json()
        finally:
            app.dependency_overrides.pop(get_db, None)

    async def test_missing_user_id(self):
        """session_id present but no user_id → error response."""
        mock_db = _mock_db()
        app.dependency_overrides[get_db] = lambda: mock_db

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/state/sync", json={"session_id": str(uuid.uuid4())})

            assert resp.status_code == 200
            body = resp.json()
            assert "error" in body
            assert "user_id" in body["error"].lower()
        finally:
            app.dependency_overrides.pop(get_db, None)


# =============================================================================
# POST /chat
# =============================================================================

class TestChat:
    """POST /chat — validates request before streaming."""

    async def test_missing_user_id_returns_400(self):
        """user_id is required — omitting it should yield HTTP 400."""
        mock_db = _mock_db()
        app.dependency_overrides[get_db] = lambda: mock_db

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/chat", json={"message": "hi", "user_id": ""})

            assert resp.status_code == 400
        finally:
            app.dependency_overrides.pop(get_db, None)


# =============================================================================
# Conversations CRUD
# =============================================================================

class TestConversationsCRUD:
    """POST /conversations/create, GET /conversations, PATCH, DELETE."""

    async def test_create_conversation(self):
        """POST /conversations/create should return a new conversation_id."""
        user_id = str(uuid.uuid4())
        mock_db = _mock_db()
        app.dependency_overrides[get_db] = lambda: mock_db

        try:
            with patch("apps.backend.state.store") as mock_store:
                # create_session should return a SessionState with the generated id
                mock_store.create_session = AsyncMock(
                    side_effect=lambda db, sid, uid: SessionState(session_id=sid)
                )

                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                    resp = await client.post("/conversations/create", json={"user_id": user_id})

            assert resp.status_code == 200
            body = resp.json()
            assert "conversation_id" in body
            assert "created_at" in body
            # Should be a valid UUID
            uuid.UUID(body["conversation_id"])
        finally:
            app.dependency_overrides.pop(get_db, None)

    async def test_list_conversations(self):
        """GET /conversations should return a list (mocking D1)."""
        user_id = "user123"
        conv_id = str(uuid.uuid4())

        mock_query = AsyncMock(return_value=[{
            "id": conv_id,
            "title": "Jazz Chat",
            "messageCount": 5,
            "lastMessagePreview": "Play some jazz",
            "lastMessageAt": 1717200000000,
            "isPinned": 0,
            "updatedAt": 1717200000000,
        }])

        with patch("apps.backend.main.d1_client.query", mock_query):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/conversations", params={"user_id": user_id})

        assert resp.status_code == 200
        body = resp.json()
        assert len(body["conversations"]) == 1
        assert body["conversations"][0]["title"] == "Jazz Chat"

    async def test_delete_conversation_not_found(self):
        """DELETE non-existent conversation → 404."""
        conv_id = str(uuid.uuid4())
        user_id = "user123"

        mock_query = AsyncMock(return_value=[])

        with patch("apps.backend.main.d1_client.query", mock_query):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.delete(f"/conversations/{conv_id}", params={"user_id": user_id})

        assert resp.status_code == 404

    async def test_patch_conversation_pin(self):
        """PATCH /conversations/:id should update is_pinned and return success."""
        conv_id = str(uuid.uuid4())
        user_id = "user123"

        mock_query = AsyncMock(return_value=[{"id": conv_id}])
        mock_execute = AsyncMock(return_value=1)

        with patch("apps.backend.main.d1_client.query", mock_query), \
             patch("apps.backend.main.d1_client.execute", mock_execute):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.patch(
                    f"/conversations/{conv_id}",
                    params={"user_id": user_id},
                    json={"is_pinned": True},
                )

        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True

    async def test_patch_conversation_not_found(self):
        """PATCH on non-existent conversation → 404."""
        conv_id = str(uuid.uuid4())
        user_id = "user123"

        mock_query = AsyncMock(return_value=[])

        with patch("apps.backend.main.d1_client.query", mock_query):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.patch(
                    f"/conversations/{conv_id}",
                    params={"user_id": user_id},
                    json={"title": "New Title"},
                )

        assert resp.status_code == 404
