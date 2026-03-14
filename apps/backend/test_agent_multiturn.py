"""
Multi-turn agent tests — deterministic, CI-safe.

FakeMessagesListChatModel with pre-scripted AIMessages, real LangGraph
agent graph, real tools (Apple Music + DuckDuckGo mocked), MemorySaver.
No API keys needed.

Tools emit MusicKit actions as fire-and-forget SSE events — no interrupt/resume.
The agent now uses separate tools: search_music → add_to_queue → play_track.

Run:
    uv run --package backend --extra dev pytest apps/backend/test_agent_multiturn.py -v
"""
from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from typing import Optional

import pytest
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage
from langgraph.checkpoint.memory import MemorySaver

# Per-turn timeout (seconds)
CHAT_TIMEOUT = 120


class FakeChatModelWithTools(FakeMessagesListChatModel):
    """FakeMessagesListChatModel that supports bind_tools.

    create_agent calls model.bind_tools() internally. The base class
    raises NotImplementedError — we return self since pre-scripted
    responses already contain correct tool_calls.
    """

    def bind_tools(self, tools, **kwargs):
        return self


from apps.backend.agent import (
    _process_astream,
    _session_context,
    _db_context,
    _user_id_context,
    create_music_agent,
)
from apps.backend.state import SessionState, TrackInfo


# =============================================================================
# ChatResult
# =============================================================================

@dataclass
class ChatResult:
    """Everything produced by a single agent turn."""
    response: str
    events: list[dict] = field(default_factory=list)
    message_parts: list[dict] = field(default_factory=list)


# =============================================================================
# AgentTestAdapter
# =============================================================================

class AgentTestAdapter:
    """
    Test harness for the Playhead DJ agent.

    Tools emit MusicKit actions as fire-and-forget SSE — no interrupt/resume.
    The graph completes in a single pass.
    """

    def __init__(self, model, session_state: Optional[SessionState] = None):
        self.model = model
        self.checkpointer = MemorySaver()
        self.session = session_state or SessionState()
        self.thread_id = str(uuid.uuid4())

    async def chat(self, message: str, timeout: float = CHAT_TIMEOUT) -> ChatResult:
        """Send a user message. Raises TimeoutError if too slow."""
        return await asyncio.wait_for(self._chat_inner(message), timeout=timeout)

    async def _chat_inner(self, message: str) -> ChatResult:
        _session_context.set(self.session)
        _db_context.set(None)
        _user_id_context.set(None)

        graph = create_music_agent(
            state_context=self.session.get_context_summary(),
            checkpointer=self.checkpointer,
            model=self.model,
        )
        config = {"configurable": {"thread_id": self.thread_id}}

        all_events: list[dict] = []
        async for event in _process_astream(
            graph,
            {"messages": [{"role": "user", "content": message}]},
            config,
        ):
            all_events.append(event)
            if event.get("event") == "action":
                self._apply_action(event["data"])

        done_event = next((e for e in all_events if e["event"] == "done"), None)
        response = done_event["data"]["full_response"] if done_event else ""
        parts = done_event["data"].get("message_parts", []) if done_event else []

        return ChatResult(response=response, events=all_events, message_parts=parts)

    def _apply_action(self, action_data: dict) -> None:
        """Simulate frontend MusicKit execution on session state."""
        action_type = action_data.get("type")
        data = action_data.get("data", {})

        if action_type == "play_track":
            idx = data.get("index", 0)
            if self.session.playlist and 0 <= idx < len(self.session.playlist):
                self.session.current_track = self.session.playlist[idx]
                self.session.is_playing = True

        elif action_type == "add_to_queue":
            track = TrackInfo(
                id=data.get("track_id", ""),
                name=data.get("name", "Unknown"),
                artist=data.get("artist", "Unknown"),
                album=data.get("album"),
                artwork_url=data.get("artwork_url"),
                duration=data.get("duration"),
            )
            self.session.playlist.append(track)

        elif action_type == "skip_next":
            if self.session.current_track and self.session.playlist:
                current_idx = next(
                    (i for i, t in enumerate(self.session.playlist) if t.id == self.session.current_track.id),
                    -1,
                )
                next_idx = current_idx + 1
                if next_idx < len(self.session.playlist):
                    self.session.current_track = self.session.playlist[next_idx]
                    self.session.is_playing = True

        elif action_type == "remove_track":
            idx = data.get("index", -1)
            if 0 <= idx < len(self.session.playlist):
                removed = self.session.playlist.pop(idx)
                if self.session.current_track and self.session.current_track.id == removed.id:
                    self.session.current_track = None
                    self.session.is_playing = False


# =============================================================================
# Tests — multi-step tool flows (search_music → add_to_queue → play_track)
# =============================================================================

class TestMultiTurnDeterministic:

    @pytest.mark.asyncio
    async def test_play_uses_three_step_flow(self, mock_apple_music):
        """Play a song → agent calls search_music, add_to_queue, play_track in sequence."""
        model = FakeChatModelWithTools(responses=[
            # Step 1: search
            AIMessage(content="", tool_calls=[{
                "name": "search_music", "args": {"query": "Take Five"},
                "id": "call_search", "type": "tool_call",
            }]),
            # Step 2: add to queue
            AIMessage(content="", tool_calls=[{
                "name": "add_to_queue", "args": {"track_id": "12345"},
                "id": "call_add", "type": "tool_call",
            }]),
            # Step 3: play
            AIMessage(content="", tool_calls=[{
                "name": "play_track", "args": {"index": "1"},
                "id": "call_play", "type": "tool_call",
            }]),
            AIMessage(content="正在为你播放 Take Five by Dave Brubeck！"),
        ])

        adapter = AgentTestAdapter(model)
        result = await adapter.chat("播放 Take Five")

        # Verify all three tool calls were emitted
        tool_names = [
            e["data"]["tool_name"] for e in result.events if e["event"] == "tool_start"
        ]
        assert tool_names == ["search_music", "add_to_queue", "play_track"]

        # Verify SSE actions: add_to_queue + play_track
        action_types = [
            e["data"]["type"] for e in result.events if e.get("event") == "action"
        ]
        assert "add_to_queue" in action_types
        assert "play_track" in action_types

        # Verify session state updated correctly
        assert adapter.session.current_track is not None
        assert adapter.session.current_track.name == "Take Five"
        assert adapter.session.is_playing is True
        assert "Take Five" in result.response

    @pytest.mark.asyncio
    async def test_add_to_queue_without_play(self, mock_apple_music):
        """Add to queue → agent calls search_music + add_to_queue, no play_track."""
        model = FakeChatModelWithTools(responses=[
            AIMessage(content="", tool_calls=[{
                "name": "search_music", "args": {"query": "Take Five"},
                "id": "call_search", "type": "tool_call",
            }]),
            AIMessage(content="", tool_calls=[{
                "name": "add_to_queue", "args": {"track_id": "12345"},
                "id": "call_add", "type": "tool_call",
            }]),
            AIMessage(content="已将 Take Five 加入队列！"),
        ])

        adapter = AgentTestAdapter(model)
        result = await adapter.chat("加入 Take Five 到队列")

        tool_names = [
            e["data"]["tool_name"] for e in result.events if e["event"] == "tool_start"
        ]
        assert tool_names == ["search_music", "add_to_queue"]

        # Track added to playlist but nothing is playing
        assert len(adapter.session.playlist) == 1
        assert adapter.session.playlist[0].name == "Take Five"
        assert adapter.session.current_track is None

    @pytest.mark.asyncio
    async def test_queue_multiple_songs(self, mock_apple_music):
        """Queue 3 songs across 3 turns — playlist accumulates, nothing plays."""
        model = FakeChatModelWithTools(responses=[
            # Turn 1: search + add
            AIMessage(content="", tool_calls=[{
                "name": "search_music", "args": {"query": "Song A"},
                "id": "call_s1", "type": "tool_call",
            }]),
            AIMessage(content="", tool_calls=[{
                "name": "add_to_queue", "args": {"track_id": "12345"},
                "id": "call_a1", "type": "tool_call",
            }]),
            AIMessage(content="Added Song A."),
            # Turn 2: search + add
            AIMessage(content="", tool_calls=[{
                "name": "search_music", "args": {"query": "Song B"},
                "id": "call_s2", "type": "tool_call",
            }]),
            AIMessage(content="", tool_calls=[{
                "name": "add_to_queue", "args": {"track_id": "12345"},
                "id": "call_a2", "type": "tool_call",
            }]),
            AIMessage(content="Added Song B."),
            # Turn 3: search + add
            AIMessage(content="", tool_calls=[{
                "name": "search_music", "args": {"query": "Song C"},
                "id": "call_s3", "type": "tool_call",
            }]),
            AIMessage(content="", tool_calls=[{
                "name": "add_to_queue", "args": {"track_id": "12345"},
                "id": "call_a3", "type": "tool_call",
            }]),
            AIMessage(content="Added Song C."),
        ])

        adapter = AgentTestAdapter(model)
        await adapter.chat("加入 Song A")
        await adapter.chat("加入 Song B")
        await adapter.chat("加入 Song C")

        assert len(adapter.session.playlist) >= 3
        assert adapter.session.current_track is None

    @pytest.mark.asyncio
    async def test_play_then_whats_playing(self, mock_apple_music):
        """Play a song → ask what's playing → agent reports the track."""
        model = FakeChatModelWithTools(responses=[
            # Turn 1: three-step play
            AIMessage(content="", tool_calls=[{
                "name": "search_music", "args": {"query": "Take Five"},
                "id": "call_search", "type": "tool_call",
            }]),
            AIMessage(content="", tool_calls=[{
                "name": "add_to_queue", "args": {"track_id": "12345"},
                "id": "call_add", "type": "tool_call",
            }]),
            AIMessage(content="", tool_calls=[{
                "name": "play_track", "args": {"index": "1"},
                "id": "call_play", "type": "tool_call",
            }]),
            AIMessage(content="正在为你播放 Take Five！"),
            # Turn 2: check now playing
            AIMessage(content="", tool_calls=[{
                "name": "get_now_playing", "args": {},
                "id": "call_np", "type": "tool_call",
            }]),
            AIMessage(content="当前正在播放 Take Five by Dave Brubeck"),
        ])

        adapter = AgentTestAdapter(model)

        r1 = await adapter.chat("播放 Take Five")
        assert adapter.session.is_playing is True

        r2 = await adapter.chat("现在放什么？")
        assert any(
            e["event"] == "tool_start" and e["data"]["tool_name"] == "get_now_playing"
            for e in r2.events
        )

    @pytest.mark.asyncio
    async def test_skip_next(self, mock_apple_music):
        """Skip from track A to track B."""
        session = SessionState(
            playlist=[
                TrackInfo(id="a", name="Track A", artist="Artist A"),
                TrackInfo(id="b", name="Track B", artist="Artist B"),
            ],
            current_track=TrackInfo(id="a", name="Track A", artist="Artist A"),
            is_playing=True,
        )
        model = FakeChatModelWithTools(responses=[
            AIMessage(content="", tool_calls=[{
                "name": "skip_next", "args": {},
                "id": "call_skip", "type": "tool_call",
            }]),
            AIMessage(content="Skipped to Track B!"),
        ])

        adapter = AgentTestAdapter(model, session_state=session)
        result = await adapter.chat("下一首")

        assert any(
            e.get("event") == "action" and e["data"]["type"] == "skip_next"
            for e in result.events
        )
        assert adapter.session.current_track.id == "b"

    @pytest.mark.asyncio
    async def test_remove_from_playlist(self, mock_apple_music):
        """Remove a track — verify action and state change."""
        session = SessionState(
            playlist=[
                TrackInfo(id="a", name="Track A", artist="Artist A"),
                TrackInfo(id="b", name="Track B", artist="Artist B"),
                TrackInfo(id="c", name="Track C", artist="Artist C"),
            ],
            current_track=TrackInfo(id="a", name="Track A", artist="Artist A"),
            is_playing=True,
        )
        model = FakeChatModelWithTools(responses=[
            AIMessage(content="", tool_calls=[{
                "name": "remove_from_playlist", "args": {"index": "1"},
                "id": "call_rm", "type": "tool_call",
            }]),
            AIMessage(content="Removed Track A."),
        ])

        adapter = AgentTestAdapter(model, session_state=session)
        result = await adapter.chat("移除第一首")

        assert any(e.get("event") == "action" and e["data"]["type"] == "remove_track" for e in result.events)
        assert len(adapter.session.playlist) < 3
        assert adapter.session.current_track is None
        assert adapter.session.is_playing is False
