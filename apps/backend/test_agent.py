"""
Tests for agent features: web search tool, thinking mode extraction, tool registration.

Uses FakeGraph and MemorySaver — no database, no API keys, no network (except
search_web which hits DuckDuckGo for a real smoke test).

Run:
    uv run --project apps/backend --extra dev pytest apps/backend/test_agent.py -v
"""
from __future__ import annotations

import pytest
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import MagicMock

from apps.backend.agent import (
    search_web,
    TOOLS,
    SYSTEM_PROMPT_TEMPLATE,
    _process_astream,
    create_music_agent,
)


# =============================================================================
# Fakes — minimal stand-ins for LangGraph objects, just enough for
# _process_astream to iterate without touching any real infrastructure.
# =============================================================================

@dataclass
class FakeMessageChunk:
    """
    Mimics AIMessageChunk.  Fields map 1:1 to what _process_astream reads:
      - content (str | list)
      - additional_kwargs (dict, may contain reasoning_content)
      - tool_calls / tool_call_chunks
      - type ("ai" | "tool")
    """
    content: Any = ""
    additional_kwargs: dict = field(default_factory=dict)
    tool_calls: list = field(default_factory=list)
    tool_call_chunks: list = field(default_factory=list)
    type: str = "ai"


@dataclass
class _FakeGraphState:
    """aget_state() return value. Empty tasks = graph completed normally."""
    tasks: list = field(default_factory=list)


class FakeGraph:
    """
    Mock LangGraph agent graph that replays pre-recorded (mode, chunk) pairs.
    Supports astream() iteration and aget_state() for terminal-event logic.
    """
    def __init__(self, chunks: list[tuple[str, tuple]]):
        self._chunks = chunks

    async def astream(self, stream_input, *, config, stream_mode):
        for mode, chunk in self._chunks:
            yield mode, chunk

    async def aget_state(self, config):
        return _FakeGraphState()


# =============================================================================
# 1. search_web tool — real DuckDuckGo smoke test
# =============================================================================

class TestSearchWebTool:
    """Verify the search_web @tool hits DuckDuckGo and returns formatted results."""

    def test_returns_formatted_results(self):
        """search_web should return a string — either formatted results or a no-results message.
        DuckDuckGo may rate-limit in CI, so we only assert the return type and that
        it doesn't crash. When results come back, they start with '- '.
        """
        result = search_web.invoke({"query": "best jazz albums 2024"})
        assert isinstance(result, str)
        assert len(result) > 0
        # If we got real results, verify the format
        if result != "No results found." and not result.startswith("Web search failed"):
            lines = [l for l in result.split("\n") if l.startswith("- ")]
            assert len(lines) > 0

    def test_graceful_on_nonsense_query(self):
        """Should not crash even on garbage queries."""
        result = search_web.invoke({"query": "xyzzy_nonexistent_12345_zzz"})
        assert isinstance(result, str)


# =============================================================================
# 2. Tool registration
# =============================================================================

class TestToolRegistration:
    EXPECTED_TOOLS = {
        "search_music", "search_web", "add_to_queue", "play_track",
        "skip_next", "remove_from_playlist", "get_now_playing", "get_playlist",
    }

    def test_search_web_registered(self):
        names = {t.name for t in TOOLS}
        assert "search_web" in names

    def test_all_tools_present(self):
        actual = {t.name for t in TOOLS}
        assert self.EXPECTED_TOOLS == actual


# =============================================================================
# 3. System prompt
# =============================================================================

class TestSystemPrompt:
    def test_mentions_search_web(self):
        prompt = SYSTEM_PROMPT_TEMPLATE.format(state_context="test")
        assert "search_web" in prompt

    def test_distinguishes_search_tools(self):
        """Prompt should explain search_web = discovery, search_music = Apple Music."""
        prompt = SYSTEM_PROMPT_TEMPLATE.format(state_context="test").lower()
        assert "discovery" in prompt or "recommendations" in prompt


# =============================================================================
# 4. Thinking / reasoning extraction in _process_astream
# =============================================================================

class TestThinkingExtraction:
    """
    _process_astream must handle three thinking sources:
      a) Kimi K2.5: additional_kwargs.reasoning_content  (object-style chunk)
      b) Kimi K2.5: additional_kwargs.reasoning_content  (dict-style chunk)
      c) Claude fallback: content list with {"type": "thinking"} blocks
    """

    @pytest.mark.asyncio
    async def test_kimi_reasoning_content_emits_thinking_event(self):
        """additional_kwargs.reasoning_content → thinking SSE event."""
        thinking_text = "Let me analyze this music request..."
        reply_text = "Here are my jazz recommendations!"

        graph = FakeGraph([
            # Chunk 1: reasoning only (content is empty)
            ("messages", (FakeMessageChunk(
                content="",
                additional_kwargs={"reasoning_content": thinking_text},
            ),)),
            # Chunk 2: actual text reply
            ("messages", (FakeMessageChunk(content=reply_text),)),
        ])

        events = [e async for e in _process_astream(graph, {"messages": []}, {})]
        types = [e["event"] for e in events]

        assert "thinking" in types, f"Expected 'thinking' event, got {types}"
        thinking_ev = next(e for e in events if e["event"] == "thinking")
        assert thinking_ev["data"]["content"] == thinking_text

    @pytest.mark.asyncio
    async def test_text_content_still_works(self):
        """Plain text chunks should still produce text + done events."""
        graph = FakeGraph([
            ("messages", (FakeMessageChunk(content="Hello!"),)),
        ])

        events = [e async for e in _process_astream(graph, {"messages": []}, {})]
        types = [e["event"] for e in events]

        assert "text" in types
        assert "done" in types

    @pytest.mark.asyncio
    async def test_reasoning_before_text_in_message_parts(self):
        """When a single chunk has both reasoning + text, thinking must come first."""
        graph = FakeGraph([
            ("messages", (FakeMessageChunk(
                content="the reply",
                additional_kwargs={"reasoning_content": "thinking first..."},
            ),)),
        ])

        events = [e async for e in _process_astream(graph, {"messages": []}, {})]
        done_ev = next(e for e in events if e["event"] == "done")
        parts = done_ev["data"]["message_parts"]
        part_types = [p["type"] for p in parts]

        # Thinking is extracted in step 0, text in step 1 → thinking comes first
        assert part_types == ["thinking", "text"]

    @pytest.mark.asyncio
    async def test_dict_style_chunk_reasoning(self):
        """Some LangGraph versions yield chunks as dicts instead of objects."""
        graph = FakeGraph([
            ("messages", ({"kwargs": {
                "content": "answer text",
                "additional_kwargs": {"reasoning_content": "dict-thinking"},
                "tool_calls": None,
                "tool_call_chunks": None,
            }},)),
        ])

        events = [e async for e in _process_astream(graph, {"messages": []}, {})]
        types = [e["event"] for e in events]

        assert "thinking" in types
        thinking_ev = next(e for e in events if e["event"] == "thinking")
        assert thinking_ev["data"]["content"] == "dict-thinking"

    @pytest.mark.asyncio
    async def test_claude_style_thinking_content_block(self):
        """Existing fallback: content list with {type: 'thinking'} blocks."""
        graph = FakeGraph([
            ("messages", (FakeMessageChunk(
                content=[
                    {"type": "thinking", "thinking": "claude-style reasoning"},
                    {"type": "text", "text": "visible response"},
                ],
            ),)),
        ])

        events = [e async for e in _process_astream(graph, {"messages": []}, {})]
        types = [e["event"] for e in events]

        assert types.count("thinking") == 1
        assert "text" in types

    @pytest.mark.asyncio
    async def test_no_thinking_when_absent(self):
        """No thinking events if the model didn't produce any reasoning."""
        graph = FakeGraph([
            ("messages", (FakeMessageChunk(content="plain reply"),)),
        ])

        events = [e async for e in _process_astream(graph, {"messages": []}, {})]
        types = [e["event"] for e in events]

        assert "thinking" not in types
        assert types == ["text", "done"]

    @pytest.mark.asyncio
    async def test_custom_mode_passthrough(self):
        """Custom mode chunks (SSE actions from tools) should pass through as-is."""
        action_payload = {"event": "action", "data": {"type": "play_track", "data": {}}}
        graph = FakeGraph([
            ("custom", action_payload),
            ("messages", (FakeMessageChunk(content="done"),)),
        ])

        events = [e async for e in _process_astream(graph, {"messages": []}, {})]

        assert events[0] == action_payload
        assert events[1]["event"] == "text"


# =============================================================================
# 5. Agent creation with MemorySaver — no DB needed
# =============================================================================

class TestCreateMusicAgent:
    """Verify agent graph can be constructed with injected model + MemorySaver."""

    def test_with_memory_saver_and_mock_model(self):
        from langgraph.checkpoint.memory import MemorySaver

        # Mock model — we're testing graph construction, not LLM inference
        mock_model = MagicMock()
        mock_model.bind_tools = MagicMock(return_value=mock_model)

        agent = create_music_agent(
            state_context="No track playing. Empty playlist.",
            checkpointer=MemorySaver(),
            model=mock_model,
        )
        assert agent is not None

    def test_without_model_requires_api_key(self):
        """When model=None (default), OPENAI_API_KEY must be set."""
        import os
        old = os.environ.pop("OPENAI_API_KEY", None)
        try:
            with pytest.raises(ValueError, match="OPENAI_API_KEY"):
                create_music_agent(state_context="test")
        finally:
            if old is not None:
                os.environ["OPENAI_API_KEY"] = old
