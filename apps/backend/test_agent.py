"""
Tests for agent features: native web search, thinking mode extraction, tool registration.

Uses FakeGraph and MemorySaver — no database, no API keys, no network.

Run:
    uv run --project apps/backend --extra dev pytest apps/backend/test_agent.py -v
"""
from __future__ import annotations

import pytest
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import MagicMock

from apps.backend.agent import (
    WEB_SEARCH_TOOL,
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
# 1. Native web search tool spec
# =============================================================================

class TestWebSearchToolSpec:
    """Verify the WEB_SEARCH_TOOL dict has the correct structure."""

    def test_has_required_fields(self):
        assert WEB_SEARCH_TOOL["type"] == "web_search_20250305"
        assert WEB_SEARCH_TOOL["name"] == "web_search"

    def test_is_dict_not_tool(self):
        """Server-side tools are dicts, not BaseTool instances."""
        assert isinstance(WEB_SEARCH_TOOL, dict)


# =============================================================================
# 2. Tool registration
# =============================================================================

class TestToolRegistration:
    EXPECTED_TOOLS = {
        "search_music", "add_to_queue", "play_track",
        "skip_next", "remove_from_playlist", "get_now_playing", "get_playlist",
    }

    def test_all_tools_present(self):
        actual = {t.name for t in TOOLS}
        assert self.EXPECTED_TOOLS == actual

    def test_web_search_not_in_base_tools(self):
        """web_search is a server-side tool added conditionally, not in TOOLS."""
        names = {t.name for t in TOOLS}
        assert "web_search" not in names


# =============================================================================
# 3. System prompt
# =============================================================================

class TestSystemPrompt:
    def test_mentions_web_search(self):
        prompt = SYSTEM_PROMPT_TEMPLATE.format(state_context="test")
        assert "web_search" in prompt

    def test_distinguishes_search_tools(self):
        """Prompt should explain web_search = discovery, search_music = Apple Music."""
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
# 5. Server-side web_search streaming events
# =============================================================================

class TestWebSearchStreaming:
    """Verify _process_astream emits tool_start/tool_end for server-side web_search."""

    @pytest.mark.asyncio
    async def test_server_tool_use_emits_tool_start(self):
        """server_tool_use content block → tool_start SSE event."""
        graph = FakeGraph([
            ("messages", (FakeMessageChunk(
                content=[
                    {"type": "server_tool_use", "id": "srvtoolu_123", "name": "web_search", "input": {"query": "best jazz 2024"}},
                ],
            ),)),
            ("messages", (FakeMessageChunk(
                content=[
                    {"type": "web_search_tool_result", "tool_use_id": "srvtoolu_123", "content": [
                        {"type": "web_search_result", "url": "https://example.com", "title": "Jazz 2024", "page_age": "2d", "encrypted_content": "..."},
                    ]},
                ],
            ),)),
            ("messages", (FakeMessageChunk(
                content=[{"type": "text", "text": "Here are the top jazz albums!"}],
            ),)),
        ])

        events = [e async for e in _process_astream(graph, {"messages": []}, {})]
        types = [e["event"] for e in events]

        assert "tool_start" in types
        tool_start = next(e for e in events if e["event"] == "tool_start")
        assert tool_start["data"]["tool_name"] == "web_search"
        assert tool_start["data"]["id"] == "srvtoolu_123"
        assert tool_start["data"]["args"] == {"query": "best jazz 2024"}

    @pytest.mark.asyncio
    async def test_web_search_result_emits_tool_end(self):
        """web_search_tool_result content block → tool_end SSE event."""
        graph = FakeGraph([
            ("messages", (FakeMessageChunk(
                content=[
                    {"type": "server_tool_use", "id": "srvtoolu_456", "name": "web_search", "input": {"query": "miles davis"}},
                ],
            ),)),
            ("messages", (FakeMessageChunk(
                content=[
                    {"type": "web_search_tool_result", "tool_use_id": "srvtoolu_456", "content": [
                        {"type": "web_search_result", "url": "https://example.com/miles", "title": "Miles Davis"},
                    ]},
                ],
            ),)),
            ("messages", (FakeMessageChunk(content="Great artist!"),)),
        ])

        events = [e async for e in _process_astream(graph, {"messages": []}, {})]
        types = [e["event"] for e in events]

        assert "tool_end" in types
        tool_end = next(e for e in events if e["event"] == "tool_end")
        assert tool_end["data"]["id"] == "srvtoolu_456"
        assert tool_end["data"]["tool_name"] == "web_search"
        assert tool_end["data"]["status"] == "success"

    @pytest.mark.asyncio
    async def test_full_web_search_flow_event_order(self):
        """Full flow: tool_start → tool_end → text → done, in order."""
        graph = FakeGraph([
            ("messages", (FakeMessageChunk(
                content=[
                    {"type": "server_tool_use", "id": "srv_001", "name": "web_search", "input": {"query": "周杰伦"}},
                    {"type": "web_search_tool_result", "tool_use_id": "srv_001", "content": [{"type": "web_search_result", "url": "https://zh.wikipedia.org", "title": "Jay Chou"}]},
                    {"type": "text", "text": "周杰伦是华语乐坛天王"},
                ],
            ),)),
        ])

        events = [e async for e in _process_astream(graph, {"messages": []}, {})]
        types = [e["event"] for e in events]

        assert types == ["tool_start", "tool_end", "text", "done"]

    @pytest.mark.asyncio
    async def test_web_search_tool_call_in_message_parts(self):
        """Server-side tool calls should appear in message_parts for persistence."""
        graph = FakeGraph([
            ("messages", (FakeMessageChunk(
                content=[
                    {"type": "server_tool_use", "id": "srv_002", "name": "web_search", "input": {"query": "test"}},
                    {"type": "web_search_tool_result", "tool_use_id": "srv_002", "content": []},
                    {"type": "text", "text": "result"},
                ],
            ),)),
        ])

        events = [e async for e in _process_astream(graph, {"messages": []}, {})]
        done_ev = next(e for e in events if e["event"] == "done")
        parts = done_ev["data"]["message_parts"]
        part_types = [p["type"] for p in parts]

        assert "tool_call" in part_types
        tool_part = next(p for p in parts if p["type"] == "tool_call")
        assert tool_part["tool_name"] == "web_search"
        assert tool_part["status"] == "success"
        assert tool_part["id"] == "srv_002"

    @pytest.mark.asyncio
    async def test_text_after_web_search_still_streamed(self):
        """Text content following a web search should still be streamed normally."""
        graph = FakeGraph([
            ("messages", (FakeMessageChunk(
                content=[
                    {"type": "server_tool_use", "id": "srv_003", "name": "web_search", "input": {"query": "q"}},
                    {"type": "web_search_tool_result", "tool_use_id": "srv_003", "content": []},
                    {"type": "text", "text": "Found some great music!"},
                ],
            ),)),
        ])

        events = [e async for e in _process_astream(graph, {"messages": []}, {})]
        text_events = [e for e in events if e["event"] == "text"]

        assert len(text_events) == 1
        assert text_events[0]["data"]["content"] == "Found some great music!"

        done = next(e for e in events if e["event"] == "done")
        assert done["data"]["full_response"] == "Found some great music!"


# =============================================================================
# 6. Agent creation — web_search binding
# =============================================================================

class TestWebSearchBinding:
    """Verify WEB_SEARCH_TOOL is conditionally passed to create_agent based on model type."""

    def test_anthropic_model_includes_web_search(self):
        """ChatAnthropic models should have WEB_SEARCH_TOOL in tools passed to create_agent."""
        from unittest.mock import patch as mock_patch
        from langchain_anthropic import ChatAnthropic
        from langgraph.checkpoint.memory import MemorySaver

        mock_model = MagicMock(spec=ChatAnthropic)
        mock_model.bind_tools = MagicMock(return_value=mock_model)

        with mock_patch("apps.backend.agent.create_agent") as mock_create:
            mock_create.return_value = MagicMock()
            create_music_agent(
                state_context="test",
                checkpointer=MemorySaver(),
                model=mock_model,
            )

            # Verify create_agent was called with WEB_SEARCH_TOOL in tools
            call_kwargs = mock_create.call_args
            tools_arg = call_kwargs.kwargs.get("tools") or call_kwargs[1].get("tools")
            dict_tools = [t for t in tools_arg if isinstance(t, dict)]
            assert any(
                t.get("type") == "web_search_20250305" for t in dict_tools
            ), f"WEB_SEARCH_TOOL not found in create_agent tools. Dicts: {dict_tools}"

    def test_non_anthropic_model_excludes_web_search(self):
        """Non-ChatAnthropic models should NOT have WEB_SEARCH_TOOL in tools."""
        from unittest.mock import patch as mock_patch
        from langgraph.checkpoint.memory import MemorySaver

        mock_model = MagicMock()  # not spec=ChatAnthropic
        mock_model.bind_tools = MagicMock(return_value=mock_model)

        with mock_patch("apps.backend.agent.create_agent") as mock_create:
            mock_create.return_value = MagicMock()
            create_music_agent(
                state_context="test",
                checkpointer=MemorySaver(),
                model=mock_model,
            )

            call_kwargs = mock_create.call_args
            tools_arg = call_kwargs.kwargs.get("tools") or call_kwargs[1].get("tools")
            dict_tools = [t for t in tools_arg if isinstance(t, dict)]
            assert not any(
                t.get("type", "").startswith("web_search") for t in dict_tools
            ), f"WEB_SEARCH_TOOL should not be present for non-Anthropic models. Dicts: {dict_tools}"


# =============================================================================
# 7. Agent creation with MemorySaver — no DB needed
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
        """When model=None (default), API key for the configured provider must be set."""
        import os
        old_anthropic = os.environ.pop("ANTHROPIC_API_KEY", None)
        old_provider = os.environ.pop("LLM_PROVIDER", None)
        try:
            os.environ["LLM_PROVIDER"] = "anthropic"
            with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
                create_music_agent(state_context="test")
        finally:
            if old_anthropic is not None:
                os.environ["ANTHROPIC_API_KEY"] = old_anthropic
            if old_provider is not None:
                os.environ["LLM_PROVIDER"] = old_provider
            else:
                os.environ.pop("LLM_PROVIDER", None)
