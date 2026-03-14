"""
Unit tests for Pydantic models and SessionStore hydration logic.

Covers TrackInfo, Message, SessionState (add_message, get_context_summary),
and SessionStore._hydrate — the pure-logic layer that converts
DB rows into domain objects without touching the database.
"""
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from apps.backend.state import TrackInfo, Message, SessionState, SessionStore


# =============================================================================
# TrackInfo
# =============================================================================

class TestTrackInfo:
    """TrackInfo is a plain value object — verify all fields serialize correctly."""

    def test_create_with_all_fields(self):
        """All fields (required + optional) should round-trip through the model."""
        track = TrackInfo(
            id="t-001",
            name="Take Five",
            artist="Dave Brubeck",
            album="Time Out",
            artwork_url="https://example.com/art.jpg",
            duration=324.0,
        )

        assert track.id == "t-001"
        assert track.name == "Take Five"
        assert track.artist == "Dave Brubeck"
        assert track.album == "Time Out"
        assert track.artwork_url == "https://example.com/art.jpg"
        assert track.duration == 324.0

    def test_optional_fields_default_to_none(self):
        """album, artwork_url, duration are optional — should default to None."""
        track = TrackInfo(id="t-002", name="So What", artist="Miles Davis")

        assert track.album is None
        assert track.artwork_url is None
        assert track.duration is None


# =============================================================================
# Message
# =============================================================================

class TestMessage:
    """Message supports two serialization paths: simple content and multi-part."""

    def test_to_frontend_format_with_content(self):
        """Simple text messages should emit {role, content} for the frontend."""
        msg = Message(role="user", content="Play some jazz")

        result = msg.to_frontend_format()

        assert result == {"role": "user", "content": "Play some jazz"}
        # Parts key must NOT appear in content-mode output
        assert "parts" not in result

    def test_to_frontend_format_with_parts(self):
        """Multi-part messages (thinking + text + tool_calls) should emit {role, parts}."""
        parts = [
            {"type": "thinking", "content": "Let me search..."},
            {"type": "text", "content": "Here are some tracks"},
        ]
        msg = Message(role="agent", parts=parts)

        result = msg.to_frontend_format()

        assert result == {"role": "agent", "parts": parts}
        # Content key must NOT appear in parts-mode output
        assert "content" not in result

    def test_timestamp_auto_generated(self):
        """Timestamp should be auto-populated on creation (no manual input needed)."""
        before = datetime.now()
        msg = Message(role="user", content="hi")
        after = datetime.now()

        assert before <= msg.timestamp <= after


# =============================================================================
# SessionState
# =============================================================================

class TestSessionState:
    """SessionState manages chat history and generates LLM context summaries."""

    def test_add_message_with_content(self):
        """add_message(content=...) should append a simple text message."""
        session = SessionState()
        session.add_message("user", content="Hello")

        assert len(session.chat_history) == 1
        assert session.chat_history[0].role == "user"
        assert session.chat_history[0].content == "Hello"
        assert session.chat_history[0].parts is None

    def test_add_message_with_parts(self):
        """add_message(parts=...) should append a multi-part message."""
        parts = [{"type": "text", "content": "Found it!"}]
        session = SessionState()
        session.add_message("agent", parts=parts)

        assert len(session.chat_history) == 1
        assert session.chat_history[0].role == "agent"
        assert session.chat_history[0].parts == parts
        assert session.chat_history[0].content is None

    # -- get_context_summary ------------------------------------------------

    def test_context_summary_empty_state(self):
        """No track, no playlist → default "nothing playing / empty" summary."""
        session = SessionState()

        summary = session.get_context_summary()

        assert "Nothing is currently playing." in summary
        assert "Playlist is empty." in summary

    def test_context_summary_with_track_and_playlist(self):
        """Track + small playlist → summary includes track name and playlist count."""
        track = TrackInfo(id="1", name="So What", artist="Miles Davis")
        playlist = [
            TrackInfo(id="1", name="So What", artist="Miles Davis"),
            TrackInfo(id="2", name="Blue Train", artist="John Coltrane"),
        ]
        session = SessionState(current_track=track, playlist=playlist)

        summary = session.get_context_summary()

        assert "Currently playing: So What by Miles Davis" in summary
        assert "Playlist has 2 tracks:" in summary
        assert "So What - Miles Davis" in summary
        assert "Blue Train - John Coltrane" in summary

    def test_context_summary_truncates_long_playlist(self):
        """Playlists with >5 tracks should show the first 5 + a '... and N more' line."""
        tracks = [
            TrackInfo(id=str(i), name=f"Track {i}", artist=f"Artist {i}")
            for i in range(8)
        ]
        session = SessionState(playlist=tracks)

        summary = session.get_context_summary()

        # First 5 tracks should appear individually
        assert "Track 0 - Artist 0" in summary
        assert "Track 4 - Artist 4" in summary
        # Tracks 5-7 are hidden behind the truncation notice
        assert "Track 5" not in summary
        assert "... and 3 more" in summary

    def test_session_id_auto_generated(self):
        """session_id should be a valid UUID string by default."""
        import uuid

        session = SessionState()

        # Should not raise — validates the format
        uuid.UUID(session.session_id)


# =============================================================================
# SessionStore._hydrate
# =============================================================================

class TestHydrateSession:
    """_hydrate converts a Supabase row dict into a SessionState."""

    def _make_data(self, *, context=None, messages=None, last_synced_at=None):
        """Build a dict matching the Supabase row format that _hydrate reads."""
        return {
            "context": context or {},
            "messages": messages or [],
            "last_synced_at": last_synced_at,
        }

    def test_hydrate_full_context(self):
        """Full context (track, playlist, playback) should be fully restored."""
        data = self._make_data(
            context={
                "current_track": {
                    "id": "t-1",
                    "name": "Take Five",
                    "artist": "Dave Brubeck",
                    "album": "Time Out",
                },
                "playlist": [
                    {"id": "t-1", "name": "Take Five", "artist": "Dave Brubeck"},
                    {"id": "t-2", "name": "Blue Rondo", "artist": "Dave Brubeck"},
                ],
                "is_playing": True,
                "playback_position": 42.5,
            },
            messages=[
                {"role": "user", "content": "Play Take Five"},
                {"role": "agent", "content": "Now playing Take Five!"},
            ],
            last_synced_at="2025-01-15T12:00:00",
        )

        store = SessionStore()
        session = store._hydrate(data, "abc-session-id")

        assert session.session_id == "abc-session-id"
        assert session.current_track is not None
        assert session.current_track.name == "Take Five"
        assert session.current_track.album == "Time Out"
        assert len(session.playlist) == 2
        assert session.playlist[1].name == "Blue Rondo"
        assert session.is_playing is True
        assert session.playback_position == 42.5
        assert len(session.chat_history) == 2
        assert session.chat_history[0].role == "user"
        assert session.chat_history[1].content == "Now playing Take Five!"

    def test_hydrate_empty_context(self):
        """Empty/null context should produce a clean default SessionState."""
        data = self._make_data(context={}, messages=[], last_synced_at=None)

        store = SessionStore()
        session = store._hydrate(data, "empty-session")

        assert session.session_id == "empty-session"
        assert session.current_track is None
        assert session.playlist == []
        assert session.is_playing is False
        assert session.playback_position == 0.0
        assert session.chat_history == []
        assert isinstance(session.last_sync, datetime)

    def test_hydrate_with_none_context(self):
        """context=None in DB (not just empty dict) should not crash."""
        data = self._make_data(context=None, messages=None)

        store = SessionStore()
        session = store._hydrate(data, "null-ctx")

        assert session.current_track is None
        assert session.playlist == []
        assert session.chat_history == []
