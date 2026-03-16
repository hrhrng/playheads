"""
Music Agent with LangGraph and AsyncPGCheckpointer

Heavy dependencies (database, Apple Music) are lazy-imported inside functions
so the module can be imported without DATABASE_URL — enables unit testing with
MemorySaver and mock models.
"""
from __future__ import annotations

import json
import logging
import os
import time
from contextvars import ContextVar
from typing import Optional, TYPE_CHECKING
from langchain.agents import create_agent
from langchain.tools import tool
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langgraph.config import get_stream_writer

if TYPE_CHECKING:
    from apps.backend.state import SessionState, TrackInfo

log = logging.getLogger("playhead.agent")


# =============================================================================
# Singleton Checkpointer (initialized once, reused across requests)
# =============================================================================

_checkpointer = None
_checkpointer_setup_done = False


async def get_checkpointer():
    """
    Get or create a singleton AsyncPostgresSaver with connection pooling.
    setup() is called only once; subsequent calls return the cached instance.
    """
    global _checkpointer, _checkpointer_setup_done

    if _checkpointer is None:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        from psycopg_pool import AsyncConnectionPool
        from apps.backend.database import DATABASE_URL_PSYCOPG

        pool = AsyncConnectionPool(
            conninfo=DATABASE_URL_PSYCOPG,
            max_size=5,
            open=False,
            kwargs={"prepare_threshold": None},
        )
        await pool.open()
        _checkpointer = AsyncPostgresSaver(pool)

    if not _checkpointer_setup_done:
        # Skip setup() — tables created manually via direct connection.
        # pgbouncer transaction mode doesn't support CREATE INDEX CONCURRENTLY.
        _checkpointer_setup_done = True
        log.info("Checkpointer ready (tables pre-created)")

    return _checkpointer


# =============================================================================
# Context Variables for Session State
# =============================================================================

# Context variable to pass session state to tools in async context
_session_context: ContextVar[Optional[SessionState]] = ContextVar('_session_context', default=None)

# Context variable to pass DB session to tools for real-time state queries
_db_context: ContextVar[Optional[object]] = ContextVar('_db_context', default=None)

# Context variable to pass user_id for session queries
_user_id_context: ContextVar[Optional[str]] = ContextVar('_user_id_context', default=None)


def _emit_action(action_type: str, data: dict) -> None:
    """Emit a MusicKit action to the frontend as an SSE event (fire-and-forget).

    The frontend receives this event and executes the corresponding MusicKit JS
    call.  The agent does NOT block waiting for confirmation — this avoids
    LangGraph's parallel-interrupt bug (#6624, #6533) and keeps the graph
    completing in a single pass.
    """
    writer = get_stream_writer()
    writer({"event": "action", "data": {"type": action_type, "data": data}})



# =============================================================================
# Tool Functions (using @tool decorator for LangChain 1.0)
# =============================================================================

@tool
async def search_music(query: str) -> str:
    """Search for music tracks on Apple Music. Returns a list of tracks with IDs.

    Args:
        query: Search query string
    """
    try:
        from apps.backend.apple_music import _apple_music_get

        # Directly call Apple Music API to search
        t0 = time.perf_counter()
        result = await _apple_music_get(
            "v1/catalog/us/search",
            params={"term": query, "types": "songs", "limit": 5}
        )
        log.info("⏱ search_music API call: %.0fms", (time.perf_counter() - t0) * 1000)

        songs = result.get("results", {}).get("songs", {}).get("data", [])

        if not songs:
            return f"No results found for '{query}'"

        # Format results with IDs for agent to use
        lines = [f"Search results for '{query}':"]
        for i, song in enumerate(songs, 1):
            attrs = song.get("attributes", {})
            song_id = song.get("id")
            name = attrs.get("name", "Unknown")
            artist = attrs.get("artistName", "Unknown Artist")
            lines.append(f"{i}. {name} - {artist} (id: {song_id})")

        return "\n".join(lines)

    except Exception as e:
        return f"Error searching music: {str(e)}"


@tool
async def get_now_playing() -> str:
    """Get information about the currently playing track."""
    # Read from ContextVar — kept in sync by add/remove tools during this run
    session = _session_context.get()

    if not session or not session.current_track:
        return "No track is currently playing."

    track = session.current_track
    status = "playing" if session.is_playing else "paused"

    result = f"Currently {status}: '{track.name}' by {track.artist}"
    if track.album:
        result += f" from the album '{track.album}'"

    return result


@tool
async def get_playlist() -> str:
    """Get the current playlist/queue of tracks."""
    # Read from ContextVar — kept in sync by add/remove tools during this run
    session = _session_context.get()

    if not session or not session.playlist:
        return "The playlist is empty."

    lines = [f"Playlist has {len(session.playlist)} tracks:"]

    # Show up to 10 tracks
    for i, track in enumerate(session.playlist[:10], 1):
        marker = "▶" if session.current_track and track.id == session.current_track.id else " "
        lines.append(f"{marker} {i}. {track.name} - {track.artist}")

    if len(session.playlist) > 10:
        lines.append(f"... and {len(session.playlist) - 10} more tracks")

    return "\n".join(lines)


@tool
async def play_track(index: str) -> str:
    """Play a specific track from the playlist by its position number (1-indexed).

    Args:
        index: Track position number starting from 1

    Returns:
        Confirmation message
    """
    try:
        idx = int(index)
    except (ValueError, TypeError):
        return "Please provide a valid track number."

    _emit_action("play_track", {"index": idx - 1})

    return f"Playing track {idx}."


@tool
async def skip_next() -> str:
    """Skip to the next track in the playlist."""
    _emit_action("skip_next", {})
    return "Skipping to the next track."


@tool
async def add_to_queue(track_id: str) -> str:
    """Add a track to the queue by its Apple Music ID (from search_music results).

    Args:
        track_id: Apple Music song ID (e.g. "12345" from search results)
    """
    from apps.backend.state import TrackInfo
    from apps.backend.apple_music import _apple_music_get

    try:
        # Fetch full track info by ID from Apple Music catalog
        t0 = time.perf_counter()
        result = await _apple_music_get(f"v1/catalog/us/songs/{track_id}")
        log.info("⏱ add_to_queue API call: %.0fms", (time.perf_counter() - t0) * 1000)
        songs = result.get("data", [])
        if not songs:
            return f"No track found for ID '{track_id}'."

        song = songs[0]
        attrs = song.get("attributes", {})
        track = TrackInfo(
            id=song.get("id"),
            name=attrs.get("name", "Unknown"),
            artist=attrs.get("artistName", "Unknown Artist"),
            album=attrs.get("albumName"),
            artwork_url=attrs.get("artwork", {}).get("url"),
            duration=attrs.get("durationInMillis", 0) / 1000.0,
        )

        _emit_action("add_to_queue", {
            "query": f"{track.name} {track.artist}",
            "track_id": track.id,
            "name": track.name,
            "artist": track.artist,
            "album": track.album,
            "artwork_url": track.artwork_url,
            "duration": track.duration,
        })

        return f"Added '{track.name}' by {track.artist} to queue."
    except Exception as e:
        return f"Error adding to queue: {str(e)}"


@tool
async def remove_from_playlist(index: str) -> str:
    """Remove a track from the playlist by its position number (1-indexed).

    Args:
        index: Track position number starting from 1

    Returns:
        Confirmation message
    """
    try:
        idx = int(index)
    except (ValueError, TypeError):
        return "Please provide a valid track number."

    _emit_action("remove_track", {"index": idx - 1})

    return f"Removed track {idx} from playlist."


# =============================================================================
# Claude Native Web Search (server-side tool)
# =============================================================================

WEB_SEARCH_TOOL = {
    "type": "web_search_20250305",
    "name": "web_search",
    "max_uses": 5,
}


def _summarize_search_results(raw_content) -> str:
    """Extract readable titles/URLs from web_search_tool_result, skip encrypted data."""
    if not raw_content or not isinstance(raw_content, list):
        return ""
    lines = []
    for item in raw_content:
        if not isinstance(item, dict):
            continue
        title = item.get("title", "")
        url = item.get("url", "")
        if title or url:
            lines.append(f"- {title} ({url})" if title else f"- {url}")
    return "\n".join(lines) if lines else "Search completed"


# =============================================================================
# System Prompt Template
# =============================================================================

SYSTEM_PROMPT_TEMPLATE = """You are a friendly music DJ assistant called "Playhead DJ". You help users discover and play music.

Current State:
{state_context}

Workflow:
- "Play X" → search_music(X) → add_to_queue(id) → play_track(position)
- "Add X to queue" → search_music(X) → add_to_queue(id)
- "Search X" → search_music(X) — just search, show results
- "Play track N" → play_track(N) — play an existing track in the playlist
- "Skip" / "Next" → skip_next()
- "Remove N" → remove_from_playlist(N)
- "What's playing?" → get_now_playing()
- "Show queue" → get_playlist()
- "Recommend" → web_search(query) → show results → wait for user to pick

IMPORTANT:
- search_music only searches — it does NOT add to queue or play.
- add_to_queue needs a track_id from search_music results.
- play_track plays a track ALREADY in the playlist (1-indexed).
- remove_from_playlist takes a 1-indexed position.
- web_search is for discovery and recommendations (web results). search_music is for finding specific tracks on Apple Music.
- When asked to build a playlist, use web_search for ideas, then search_music + add_to_queue for each track.

Be conversational and fun! Keep responses concise."""


# =============================================================================
# Agent Creation (LangChain 1.0 API)
# =============================================================================

TOOLS = [search_music, add_to_queue, play_track, skip_next, remove_from_playlist, get_now_playing, get_playlist]


def create_music_agent(state_context: str, checkpointer=None, model=None):
    """
    Create the music agent with session context baked into prompt and checkpointer.

    Args:
        state_context: Formatted string describing current playback/playlist state.
        checkpointer: LangGraph checkpointer (AsyncPostgresSaver, MemorySaver, etc).
        model: Optional pre-built LLM. When None, creates a ChatOpenAI pointed at
               Kimi K2.5 using env vars. Pass a mock/fake model for testing.
    """
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(state_context=state_context)

    if model is None:
        llm_provider = os.getenv("LLM_PROVIDER", "anthropic")

        if llm_provider == "anthropic":
            api_key = os.getenv("ANTHROPIC_API_KEY")
            base_url = os.getenv("ANTHROPIC_BASE_URL")
            model_name = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")

            log.debug("LLM config: provider=anthropic, model=%s, base_url=%s", model_name, base_url or "(default)")

            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY environment variable is not set")

            thinking_budget = int(os.getenv("ANTHROPIC_THINKING_BUDGET", "0"))

            model = ChatAnthropic(
                model=model_name,
                api_key=api_key,
                base_url=base_url if base_url else None,
                streaming=True,
                thinking={"type": "enabled", "budget_tokens": thinking_budget} if thinking_budget > 0 else None,
            )
        else:
            api_key = os.getenv("OPENAI_API_KEY")
            base_url = os.getenv("OPENAI_BASE_URL")
            model_name = os.getenv("OPENAI_MODEL", "gpt-5-mini")

            log.debug("LLM config: provider=openai, model=%s, base_url=%s", model_name, base_url or "(default)")

            if not api_key:
                raise ValueError("OPENAI_API_KEY environment variable is not set")

            model = ChatOpenAI(
                model=model_name,
                api_key=api_key,
                base_url=base_url if base_url else None,
                streaming=True,
            )

    # Add Claude's native web search when using Anthropic provider
    tools = list(TOOLS)
    if isinstance(model, ChatAnthropic):
        tools.append(WEB_SEARCH_TOOL)

    # create_agent returns a graph object with checkpointer
    agent_graph = create_agent(
        model=model,
        tools=tools,
        system_prompt=system_prompt,
        checkpointer=checkpointer
    )

    return agent_graph


async def _process_astream(agent_graph, stream_input, config):
    """
    Core streaming logic shared between initial chat and resume flows.

    Processes astream() events, yields SSE events for the frontend, then checks
    whether the graph was interrupted or completed. Yields either an "interrupt"
    or "done" terminal event.

    Args:
        agent_graph: The LangGraph agent graph
        stream_input: {"messages": [...]} for initial, Command(resume=...) for resume
        config: LangGraph config with thread_id

    Yields:
        SSE event dicts: text, thinking, tool_start, tool_end, action, interrupt, done
    """
    full_response = ""
    active_tool_calls = {}  # Track tool calls: {call_id: tool_name}

    # Collect message parts for saving to history
    message_parts = []  # [{type: 'text'|'thinking'|'tool_call', ...}]
    current_text_part = None  # Accumulate text content
    current_thinking_part = None  # Accumulate thinking content
    tool_calls_map = {}  # {call_id: tool_call_dict}
    tool_call_args_buffer = {}  # {call_id: accumulated_args_string}
    emitted_tool_starts = set()  # tool_ids whose tool_start event has been sent
    # Map content-block index → tool_call id.  Anthropic's tool_call_chunks
    # use the content-block index (which counts thinking/text blocks too),
    # so a raw positional lookup into active_tool_calls fails when thinking
    # or text blocks precede tool_use blocks.
    chunk_index_to_id: dict[int, str] = {}

    try:
        async for mode, chunk in agent_graph.astream(
            stream_input,
            config=config,
            stream_mode=["messages", "custom"]
        ):
            # Handle custom mode (real-time actions from tools via get_stream_writer)
            if mode == "custom":
                yield chunk
                continue

            # Handle messages mode
            msg_obj = None
            if isinstance(chunk, (list, tuple)) and len(chunk) > 0:
                msg_obj = chunk[0]
            elif chunk:
                msg_obj = chunk

            if not msg_obj:
                continue

            # 0. Extract reasoning/thinking content
            # Claude: structured content blocks with type="thinking" (handled below)
            # Kimi fallback: additional_kwargs.reasoning_content
            reasoning = None
            if hasattr(msg_obj, 'additional_kwargs'):
                reasoning = msg_obj.additional_kwargs.get('reasoning_content')
            elif isinstance(msg_obj, dict):
                kwargs = msg_obj.get('kwargs', {})
                ak = kwargs.get('additional_kwargs', {})
                reasoning = ak.get('reasoning_content')

            if reasoning:
                if current_thinking_part is None:
                    current_thinking_part = {"type": "thinking", "content": reasoning}
                    message_parts.append(current_thinking_part)
                else:
                    current_thinking_part["content"] += reasoning
                yield {"event": "thinking", "data": {"content": reasoning}}

            # 1. Extract text content
            # Determine message type early — ToolMessages carry tool results,
            # which must only appear in the tool_end event (tool card OUTPUT),
            # not duplicated as plain text in the chat body.
            msg_type = getattr(msg_obj, 'type', None) or (
                msg_obj.get('type') if isinstance(msg_obj, dict) else None
            )

            content = None
            if hasattr(msg_obj, 'content'):
                content = msg_obj.content
            elif isinstance(msg_obj, dict):
                kwargs = msg_obj.get('kwargs', {})
                content = kwargs.get('content') or msg_obj.get('content')

            if msg_type != 'tool' and content:
                if isinstance(content, list):
                    for part in content:
                        if isinstance(part, dict):
                            if part.get("type") == "text":
                                text_content = part.get("text", "")
                                if text_content:
                                    full_response += text_content
                                    if current_text_part is None:
                                        current_text_part = {"type": "text", "content": text_content}
                                        message_parts.append(current_text_part)
                                    else:
                                        current_text_part["content"] += text_content
                                    yield {"event": "text", "data": {"content": text_content}}
                            elif part.get("type") == "thinking":
                                thinking_content = part.get("thinking", "")
                                # Skip signature blocks and empty chunks
                                if thinking_content and "signature" not in part:
                                    if current_thinking_part is None:
                                        current_thinking_part = {"type": "thinking", "content": thinking_content}
                                        message_parts.append(current_thinking_part)
                                    else:
                                        current_thinking_part["content"] += thinking_content
                                    yield {"event": "thinking", "data": {"content": thinking_content}}
                            elif part.get("type") == "server_tool_use":
                                # Server-side tool invocation (e.g. web_search)
                                tool_id = part.get("id", "")
                                tool_name = part.get("name", "")
                                tool_input = part.get("input", {})
                                if tool_name and tool_id not in active_tool_calls:
                                    current_text_part = None
                                    tool_call_part = {
                                        "type": "tool_call", "id": tool_id,
                                        "tool_name": tool_name, "args": tool_input,
                                        "status": "pending",
                                    }
                                    message_parts.append(tool_call_part)
                                    active_tool_calls[tool_id] = tool_name
                                    tool_calls_map[tool_id] = tool_call_part
                                    # Track index for input_json_delta accumulation
                                    idx = part.get("index")
                                    if idx is not None:
                                        chunk_index_to_id[idx] = tool_id
                                    if tool_input and tool_input != {}:
                                        emitted_tool_starts.add(tool_id)
                                        yield {"event": "tool_start", "data": {
                                            "id": tool_id, "tool_name": tool_name,
                                            "args": tool_input,
                                        }}
                            elif part.get("type") == "input_json_delta":
                                # Streaming input for server_tool_use (query arrives in chunks)
                                idx = part.get("index")
                                delta = part.get("partial_json", "")
                                tool_id = chunk_index_to_id.get(idx) if idx is not None else None
                                if tool_id and delta:
                                    if tool_id not in tool_call_args_buffer:
                                        tool_call_args_buffer[tool_id] = ""
                                    tool_call_args_buffer[tool_id] += delta
                                    try:
                                        parsed = json.loads(tool_call_args_buffer[tool_id])
                                        if tool_id in tool_calls_map:
                                            tool_calls_map[tool_id]["args"] = parsed
                                        if tool_id not in emitted_tool_starts:
                                            emitted_tool_starts.add(tool_id)
                                            yield {"event": "tool_start", "data": {
                                                "id": tool_id,
                                                "tool_name": active_tool_calls.get(tool_id, "web_search"),
                                                "args": parsed,
                                            }}
                                    except json.JSONDecodeError:
                                        pass
                            elif part.get("type") in (
                                "web_search_tool_result", "web_fetch_tool_result",
                                "code_execution_tool_result",
                            ):
                                # Server-side tool result — extract readable summary
                                tool_use_id = part.get("tool_use_id", "")
                                tool_name = active_tool_calls.get(tool_use_id, "unknown")
                                raw_content = part.get("content", "")
                                result_summary = _summarize_search_results(raw_content)
                                if tool_use_id in tool_calls_map:
                                    tool_calls_map[tool_use_id]["status"] = "success"
                                    tool_calls_map[tool_use_id]["result"] = result_summary
                                # Emit deferred tool_start if input never arrived
                                if tool_use_id not in emitted_tool_starts:
                                    emitted_tool_starts.add(tool_use_id)
                                    args = tool_calls_map.get(tool_use_id, {}).get("args", {})
                                    yield {"event": "tool_start", "data": {
                                        "id": tool_use_id, "tool_name": tool_name,
                                        "args": args,
                                    }}
                                yield {"event": "tool_end", "data": {
                                    "id": tool_use_id, "tool_name": tool_name,
                                    "result": result_summary,
                                    "status": "success",
                                }}
                                active_tool_calls.pop(tool_use_id, None)
                elif isinstance(content, str) and content:
                    full_response += content
                    if current_text_part is None:
                        current_text_part = {"type": "text", "content": content}
                        message_parts.append(current_text_part)
                    else:
                        current_text_part["content"] += content
                    yield {"event": "text", "data": {"content": content}}

            # 2. Extract tool calls
            tool_calls = None
            if hasattr(msg_obj, 'tool_calls'):
                tool_calls = msg_obj.tool_calls
            elif isinstance(msg_obj, dict):
                kwargs = msg_obj.get('kwargs', {})
                tool_calls = kwargs.get('tool_calls')

            if tool_calls:
                current_text_part = None  # Reset to preserve chronological order
                for tool_call in tool_calls:
                    if isinstance(tool_call, dict):
                        tool_id = tool_call.get('id')
                        tool_name = tool_call.get('name', '')
                        tool_args = tool_call.get('args', {})
                    else:
                        tool_id = getattr(tool_call, 'id', None)
                        tool_name = getattr(tool_call, 'name', '')
                        tool_args = getattr(tool_call, 'args', {})

                    if not tool_name or not tool_name.strip():
                        continue
                    if not tool_id:
                        tool_id = f"{tool_name}:{hash(str(tool_args))}"

                    # Dedup: update existing tool call args if more complete
                    if tool_id in active_tool_calls:
                        if tool_id in tool_calls_map and tool_args and tool_args != {}:
                            tool_calls_map[tool_id]["args"] = tool_args
                            # Emit deferred tool_start now that args are available
                            if tool_id not in emitted_tool_starts:
                                emitted_tool_starts.add(tool_id)
                                yield {"event": "tool_start", "data": {
                                    "id": tool_id, "tool_name": active_tool_calls[tool_id],
                                    "args": tool_args
                                }}
                        continue

                    log.info("Tool call: %s(%s)", tool_name, tool_args)
                    active_tool_calls[tool_id] = tool_name

                    tool_call_part = {
                        "type": "tool_call", "id": tool_id,
                        "tool_name": tool_name, "args": tool_args, "status": "pending"
                    }
                    tool_calls_map[tool_id] = tool_call_part
                    message_parts.append(tool_call_part)

                    # Only emit tool_start when args are populated.
                    # For streaming parallel calls, args arrive empty first
                    # and get filled via tool_call_chunks later.
                    if tool_args and tool_args != {}:
                        emitted_tool_starts.add(tool_id)
                        yield {"event": "tool_start", "data": {"id": tool_id, "tool_name": tool_name, "args": tool_args}}

            # 2.5. Process tool_call_chunks (streaming args accumulation)
            tool_call_chunks = None
            if hasattr(msg_obj, 'tool_call_chunks'):
                tool_call_chunks = msg_obj.tool_call_chunks
            elif isinstance(msg_obj, dict):
                kwargs = msg_obj.get('kwargs', {})
                tool_call_chunks = kwargs.get('tool_call_chunks')

            if tool_call_chunks:
                for tc_chunk in tool_call_chunks:
                    if isinstance(tc_chunk, dict):
                        chunk_id = tc_chunk.get('id')
                        chunk_args = tc_chunk.get('args', '')
                        chunk_index = tc_chunk.get('index')
                    else:
                        chunk_id = getattr(tc_chunk, 'id', None)
                        chunk_args = getattr(tc_chunk, 'args', '')
                        chunk_index = getattr(tc_chunk, 'index', None)

                    # Resolve which tool_id this chunk belongs to:
                    # 1) chunk carries its own id that matches a registered call
                    # 2) use previously recorded index → id mapping
                    # 3) fall back to positional lookup (works for OpenAI-style
                    #    indices that are tool-relative, not content-block-relative)
                    tool_id = None
                    if chunk_id and chunk_id in active_tool_calls:
                        tool_id = chunk_id
                        # Record mapping so subsequent delta chunks (id=None)
                        # can be resolved via their content-block index.
                        if chunk_index is not None:
                            chunk_index_to_id[chunk_index] = chunk_id
                    elif chunk_index is not None and chunk_index in chunk_index_to_id:
                        tool_id = chunk_index_to_id[chunk_index]
                    elif chunk_index is not None and active_tool_calls:
                        tool_ids_list = list(active_tool_calls.keys())
                        if chunk_index < len(tool_ids_list):
                            tool_id = tool_ids_list[chunk_index]

                    if not tool_id or not chunk_args:
                        continue

                    if tool_id not in tool_call_args_buffer:
                        tool_call_args_buffer[tool_id] = ""
                    tool_call_args_buffer[tool_id] += chunk_args

                    try:
                        parsed_args = json.loads(tool_call_args_buffer[tool_id])
                        if tool_id in tool_calls_map:
                            tool_calls_map[tool_id]["args"] = parsed_args
                            # Args are complete — emit tool_start if not already sent
                            if tool_id not in emitted_tool_starts:
                                emitted_tool_starts.add(tool_id)
                                yield {"event": "tool_start", "data": {
                                    "id": tool_id, "tool_name": tool_calls_map[tool_id]["tool_name"],
                                    "args": parsed_args
                                }}
                    except json.JSONDecodeError:
                        pass

            # 3. Extract tool results (ToolMessage)
            # msg_type already resolved above (before text extraction)
            if msg_type == 'tool':
                tool_call_id = getattr(msg_obj, 'tool_call_id', None) or (msg_obj.get('tool_call_id') if isinstance(msg_obj, dict) else None)
                result_content = getattr(msg_obj, 'content', None) or (msg_obj.get('content') if isinstance(msg_obj, dict) else None)

                if tool_call_id:
                    tool_name = active_tool_calls.get(tool_call_id, "unknown")
                    is_error = isinstance(result_content, str) and "error" in result_content.lower()

                    # Safety net: ensure tool_start was emitted before tool_end.
                    # Covers tools with genuinely empty args, or edge cases where
                    # streaming chunks didn't trigger emission.
                    if tool_call_id not in emitted_tool_starts:
                        emitted_tool_starts.add(tool_call_id)
                        args = tool_calls_map.get(tool_call_id, {}).get("args", {})
                        yield {"event": "tool_start", "data": {
                            "id": tool_call_id, "tool_name": tool_name, "args": args
                        }}

                    if tool_call_id in tool_calls_map:
                        tool_calls_map[tool_call_id]["result"] = str(result_content) if result_content else ""
                        tool_calls_map[tool_call_id]["status"] = "error" if is_error else "success"

                    yield {"event": "tool_end", "data": {
                        "id": tool_call_id, "tool_name": tool_name,
                        "result": str(result_content) if result_content else "",
                        "status": "error" if is_error else "success"
                    }}
                    active_tool_calls.pop(tool_call_id, None)

    except Exception as e:
        log.error("Agent streaming error: %s", e, exc_info=True)
        error_msg = "Sorry, I had a little hiccup. Try again? 🎧"
        full_response = error_msg
        yield {"event": "text", "data": {"content": error_msg}}

    # -------------------------------------------------------------------------
    # After astream ends: check if graph paused (interrupt) or completed (done)
    # -------------------------------------------------------------------------
    t_aget = time.perf_counter()
    try:
        graph_state = await agent_graph.aget_state(config)
    except Exception as e:
        log.error("Failed to read graph state: %s", e)
        graph_state = None
    log.info("⏱ aget_state: %.0fms", (time.perf_counter() - t_aget) * 1000)

    if graph_state and graph_state.tasks and graph_state.tasks[0].interrupts:
        # Unexpected interrupt — tools should no longer call interrupt().
        # Log a warning but treat it as done to avoid hanging the frontend.
        interrupts = graph_state.tasks[0].interrupts
        log.warning(
            "Unexpected graph interrupt (%d pending): %s — tools should use "
            "_emit_action (fire-and-forget), not interrupt()",
            len(interrupts), interrupts[-1].value,
        )

    # Graph completed — yield done with accumulated parts & response
    if not full_response:
        fallback_msg = "I'm here to help with your music!"
        full_response = fallback_msg
        yield {"event": "text", "data": {"content": fallback_msg}}

    yield {
        "event": "done",
        "data": {"message_parts": message_parts, "full_response": full_response}
    }


async def run_agent_stream(db, message: str, session_id: str, user_id: str = None):
    """
    Run the agent with streaming output using LangGraph with AsyncPGCheckpointer.

    Tools emit MusicKit actions as SSE events (fire-and-forget) — the graph
    always completes in a single pass without interrupt/resume cycles.
    """
    if not user_id:
        raise ValueError("user_id is required for conversation persistence")

    from apps.backend.state import store
    t_start = time.perf_counter()

    def _elapsed():
        return (time.perf_counter() - t_start) * 1000

    # Get or create session (should already exist from /session/create)
    t0 = time.perf_counter()
    session = await store.get_session(db, session_id, user_id)
    if session is None:
        log.warning("Session %s not found, creating now (should be pre-created)", session_id[:8])
        session = await store.create_session(db, session_id, user_id)
    log.info("⏱ [+%.0fms] get_session", _elapsed())

    # Set ContextVars so tools can access session state
    _session_context.set(session)
    _db_context.set(db)
    _user_id_context.set(user_id)

    state_context = session.get_context_summary() if hasattr(session, 'get_context_summary') else "No state available"
    log.debug("Session state: %s", state_context[:100])

    t0 = time.perf_counter()
    checkpointer = await get_checkpointer()
    agent_graph = create_music_agent(state_context, checkpointer=checkpointer)
    config = {"configurable": {"thread_id": session_id}}
    log.info("⏱ [+%.0fms] get_checkpointer + create_agent", _elapsed())

    log.info("Agent processing: %s", message[:80])

    # Persist user message in background — don't block agent streaming
    import asyncio
    session.add_message("user", content=message)

    async def _persist_user_msg():
        from apps.backend.database import AsyncSessionLocal
        t_persist = time.perf_counter()
        async with AsyncSessionLocal() as fresh_db:
            try:
                await store.update_session(fresh_db, session, user_id)
            except Exception as e:
                log.error("Failed to persist user message for session %s: %s", session_id[:8], e)
        log.info("⏱ persist_user_message (background): %.0fms", (time.perf_counter() - t_persist) * 1000)

    asyncio.create_task(_persist_user_msg())
    log.info("⏱ [+%.0fms] persist_user_message dispatched (background)", _elapsed())

    # Stream events from the shared processing core.
    # Tools emit MusicKit actions as SSE events (fire-and-forget, no interrupt).
    # The graph always completes in a single pass — no resume needed.
    t_first_token = None
    t_last_token = None
    async for event in _process_astream(
        agent_graph,
        {"messages": [{"role": "user", "content": message}]},
        config,
    ):
        event_type = event.get("event")

        if event_type == "text" and t_first_token is None:
            t_first_token = time.perf_counter()
            log.info("⏱ [+%.0fms] first_token (TTFT)", _elapsed())

        if event_type == "text":
            t_last_token = time.perf_counter()

        if event_type == "done":
            if t_last_token:
                log.info("⏱ [+%.0fms] last_token → done (post-stream overhead: %.0fms)",
                         _elapsed(), (time.perf_counter() - t_last_token) * 1000)

            # Graph completed — persist agent message (user message already saved above)
            done_meta = event.get("data", {})
            message_parts = done_meta.get("message_parts", [])
            full_response = done_meta.get("full_response", "")

            if message_parts:
                session.add_message("agent", parts=message_parts)
            else:
                session.add_message("agent", content=full_response)

            t0 = time.perf_counter()
            log.info("Persisting session %s (%d messages)", session_id[:8], len(session.chat_history))
            async with AsyncSessionLocal() as fresh_db:
                try:
                    await store.update_session(fresh_db, session, user_id)
                except Exception as e:
                    log.error("Failed to persist session %s: %s", session_id[:8], e)
            log.info("⏱ [+%.0fms] persist_agent_message (%.0fms)", _elapsed(), (time.perf_counter() - t0) * 1000)

            log.info("⏱ [+%.0fms] TOTAL run_agent_stream", _elapsed())

            # Yield the final "done" event for the frontend
            yield {
                "event": "done",
                "data": {
                    "session_id": session.session_id,
                    "actions": [],
                    "state": {
                        "current_track": session.current_track.model_dump() if session.current_track else None,
                        "playlist": [t.model_dump() for t in session.playlist],
                        "is_playing": session.is_playing,
                        "playback_position": session.playback_position
                    }
                }
            }
            return

        # All other events (text, thinking, tool_start, tool_end, action) — pass through
        yield event


