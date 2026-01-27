"""
Music Agent with LangChain 1.0 API
"""
import os
from contextvars import ContextVar
from typing import Optional, List, Dict
from langchain.agents import create_agent
from langchain.tools import tool
from langchain_openai import ChatOpenAI
from langchain.messages import AIMessageChunk
from langchain.agents.middleware import ContextEditingMiddleware, ClearToolUsesEdit
from langchain.agents import AgentState
from langgraph.config import get_stream_writer

from apps.backend.state import store, SessionState, TrackInfo
from apps.backend.apple_music import _apple_music_get


# =============================================================================
# Context Variables for Session State
# =============================================================================

# Context variable to pass session state to tools in async context
_session_context: ContextVar[Optional[SessionState]] = ContextVar('_session_context', default=None)

# Context variable to pass DB session to tools for real-time state queries
_db_context: ContextVar[Optional[object]] = ContextVar('_db_context', default=None)

# Context variable to pass user_id for session queries
_user_id_context: ContextVar[Optional[str]] = ContextVar('_user_id_context', default=None)


async def _get_fresh_session() -> Optional[SessionState]:
    """
    Re-fetch session from DB to get the latest state.
    This ensures tools see real-time state changes from the frontend.
    """
    db = _db_context.get()
    session = _session_context.get()
    user_id = _user_id_context.get()

    if db and session:
        fresh = await store.get_session(db, session.session_id, user_id)
        if fresh:
            _session_context.set(fresh)
            return fresh
    return session



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
        # Directly call Apple Music API to search
        result = await _apple_music_get(
            "v1/catalog/us/search",
            params={"term": query, "types": "songs", "limit": 5}
        )

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
    # Re-fetch latest state from DB to see real-time changes
    session = await _get_fresh_session()

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
    # Re-fetch latest state from DB to see real-time changes
    session = await _get_fresh_session()

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
    session = _session_context.get()

    try:
        idx = int(index)
    except (ValueError, TypeError):
        return "Please provide a valid track number."

    # Validate index
    if not session or not session.playlist:
        return "The playlist is empty. Add some tracks first!"

    if idx < 1 or idx > len(session.playlist):
        return f"Invalid track number. Please choose between 1 and {len(session.playlist)}."

    track = session.playlist[idx - 1]

    # Emit action immediately via stream writer for real-time execution
    writer = get_stream_writer()
    writer({
        "event": "action",
        "data": {
            "type": "play_track",
            "data": {"index": idx - 1}  # Convert to 0-based for frontend
        }
    })

    return f"Requesting to play '{track.name}' by {track.artist}"


@tool
async def skip_next() -> str:
    """Skip to the next track in the playlist."""
    session = _session_context.get()

    if not session or not session.playlist:
        return "There's no playlist to skip through."

    # Find current track position
    current_idx = -1
    if session.current_track:
        for i, track in enumerate(session.playlist):
            if track.id == session.current_track.id:
                current_idx = i
                break

    next_idx = current_idx + 1
    if next_idx >= len(session.playlist):
        return "You're already at the last track in the playlist."

    next_track = session.playlist[next_idx]

    # Emit action immediately via stream writer for real-time execution
    writer = get_stream_writer()
    writer({
        "event": "action",
        "data": {
            "type": "play_track",
            "data": {"index": next_idx}
        }
    })

    return f"Requesting to skip to '{next_track.name}' by {next_track.artist}"


@tool
async def add_to_playlist(track_id: str) -> str:
    """Add a track to the playlist by its Apple Music ID.

    Args:
        track_id: Apple Music track ID (from search_music results)
    """
    session = _session_context.get()

    if not session:
        return "Session not available"

    if not track_id:
        return "Please provide a track ID"

    try:
        # Fetch track details by ID
        result = await _apple_music_get(f"v1/catalog/us/songs/{track_id}")

        songs = result.get("data", [])
        if not songs:
            return f"Track not found: {track_id}"

        song = songs[0]
        attrs = song.get("attributes", {})
        track = TrackInfo(
            id=song.get("id"),
            name=attrs.get("name", "Unknown"),
            artist=attrs.get("artistName", "Unknown Artist"),
            album=attrs.get("albumName"),
            artwork_url=attrs.get("artwork", {}).get("url"),
            duration=attrs.get("durationInMillis", 0) / 1000.0
        )

        # Emit action immediately via stream writer for real-time execution
        writer = get_stream_writer()
        writer({
            "event": "action",
            "data": {
                "type": "add_to_queue",
                "data": {
                    "query": f"{track.name} {track.artist}",
                    "track_id": track.id
                }
            }
        })

        return f"Requesting to add '{track.name}' by {track.artist} to playlist"

    except Exception as e:
        return f"Error adding track: {str(e)}"


@tool
async def remove_from_playlist(index: str) -> str:
    """Remove a track from the playlist by its position number (1-indexed).

    Args:
        index: Track position number starting from 1

    Returns:
        Confirmation message
    """
    session = _session_context.get()

    try:
        idx = int(index)
    except (ValueError, TypeError):
        return "Please provide a valid track number."

    # Validate index
    if not session or not session.playlist:
        return "The playlist is empty."

    if idx < 1 or idx > len(session.playlist):
        return f"Invalid track number. Please choose between 1 and {len(session.playlist)}."

    # Get track info for response (without removing it from local state)
    track_to_remove = session.playlist[idx - 1]

    # Emit action immediately via stream writer for real-time execution
    writer = get_stream_writer()
    writer({
        "event": "action",
        "data": {
            "type": "remove_track",
            "data": {"index": idx - 1}  # Convert to 0-based
        }
    })

    return f"Requesting to remove '{track_to_remove.name}' by {track_to_remove.artist} from playlist"


# =============================================================================
# System Prompt Template
# =============================================================================

SYSTEM_PROMPT_TEMPLATE = """You are a friendly music DJ assistant called "Playhead DJ". You help users discover and play music.

Current State:
{state_context}

Tools available:
- search_music(query): Search Apple Music with a search query string. Example: search_music("upbeat pop music") or search_music("Beatles")
- add_to_playlist(track_id): Add a track by its Apple Music ID
- get_now_playing: Check what's currently playing
- get_playlist: See the queue
- play_track(index): Play track by playlist position (1-indexed)
- skip_next: Skip to next track
- remove_from_playlist(index): Remove track by playlist position (1-indexed)

IMPORTANT: When calling tools, you MUST provide all required arguments:
- search_music REQUIRES a query parameter (a string describing what to search for)
- add_to_playlist REQUIRES a track_id parameter
- play_track REQUIRES an index parameter
- remove_from_playlist REQUIRES an index parameter

Workflow: First search_music to get IDs, then add_to_playlist with the ID.

Be conversational and fun! Keep responses concise."""


# =============================================================================
# Agent Creation (LangChain 1.0 API)
# =============================================================================

TOOLS = [search_music, get_now_playing, get_playlist, play_track, skip_next, add_to_playlist, remove_from_playlist]


def create_music_agent(state_context: str):
    """Create the music agent with session context baked into prompt."""
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(state_context=state_context)

    # Load OpenAI configuration from environment variables
    api_key = os.getenv('OPENAI_API_KEY')
    base_url = os.getenv('OPENAI_BASE_URL')

    # Debug logging
    print(f"[DEBUG] OPENAI_API_KEY: {api_key[:20] if api_key else 'NOT SET'}...")
    print(f"[DEBUG] OPENAI_BASE_URL: {base_url}")
    print(f"[DEBUG] Model: kimi-k2-0905-preview")

    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable is not set")

    model = ChatOpenAI(
        model="kimi-k2-0905-preview",
        api_key=api_key,
        base_url=base_url if base_url else None,
        streaming=True
    )

    # create_agent returns a graph object
    agent_graph = create_agent(
        model=model,
        tools=TOOLS,
        system_prompt=system_prompt
    )

    return agent_graph


async def run_agent_stream(db, message: str, session_id: str, user_id: str = None):
    """
    Run the agent with streaming output using LangChain 1.0 API.

    For new conversations:
    - Session should be created BEFORE calling this function (via /session/create endpoint)
    - This function only handles the chat logic
    """
    if not user_id:
        raise ValueError("user_id is required for conversation persistence")

    # Get or create session (should already exist from /session/create)
    session = await store.get_session(db, session_id, user_id)

    if session is None:
        # Fallback: Create session if it doesn't exist (shouldn't happen with new flow)
        print(f"[WARNING] Session {session_id} not found, creating it now (should be pre-created)")
        session = await store.create_session(db, session_id, user_id)

    # Set session context for tools to access
    _session_context.set(session)

    # Set DB context so tools can re-fetch fresh state in real-time
    _db_context.set(db)
    _user_id_context.set(user_id)

    # Get state context from DB (updated via sync events)
    state_context = session.get_context_summary() if hasattr(session, 'get_context_summary') else "No state available"
    print(f"Using DB state: {state_context[:100]}...")  # Log first 100 chars

    # Create agent graph
    agent_graph = create_music_agent(state_context)

    # Build messages from chat history
    messages = []
    for msg in session.chat_history[-10:]:
        if msg.role == "user":
            messages.append({"role": "user", "content": msg.content})
        else:
            # For new format with parts, extract text content
            content = msg.content
            if not content and msg.parts:
                # Extract text from parts
                text_parts = [p.get("content", "") for p in msg.parts if p.get("type") == "text"]
                content = "".join(text_parts)

            messages.append({"role": "assistant", "content": content or ""})

    # Add current message
    messages.append({"role": "user", "content": message})

    # Stream agent response using LangChain 1.0 API with token-level streaming
    full_response = ""
    active_tool_calls = {}  # Track tool calls: {call_id: tool_name}

    # Collect message parts for saving to history
    message_parts = []  # [{type: 'text'|'thinking'|'tool_call', ...}]
    current_text_part = None  # Accumulate text content
    tool_calls_map = {}  # {call_id: tool_call_dict}
    tool_call_args_buffer = {}  # {call_id: accumulated_args_string}

    from langchain_core.load import dumps
    print(dumps(messages))

    try:
        # Use stream_mode=["messages", "custom"] for token-level streaming + real-time actions
        async for mode, chunk in agent_graph.astream(
            {"messages": messages},
            stream_mode=["messages", "custom"]
        ):
            # DEBUG: Print raw chunk
            print(f"[RAW CHUNK] mode={mode}, chunk={chunk}")

            # Handle custom mode (real-time actions emitted from tools via get_stream_writer)
            if mode == "custom":
                # Custom chunks are already in {event, data} format from tools
                yield chunk
                continue

            # Handle messages mode (existing logic for text/tool events)
            # LangChain returns chunks as arrays: [message_object, metadata]
            msg_obj = None

            if isinstance(chunk, (list, tuple)) and len(chunk) > 0:
                msg_obj = chunk[0]
            elif chunk:
                msg_obj = chunk

            if not msg_obj:
                continue

            # 1. Extract text content (handle both string and list formats)
            content = None
            if hasattr(msg_obj, 'content'):
                content = msg_obj.content
            elif isinstance(msg_obj, dict):
                kwargs = msg_obj.get('kwargs', {})
                content = kwargs.get('content') or msg_obj.get('content')

            # Process content (can be string or list of parts)
            if content:
                if isinstance(content, list):
                    # Multi-part content (text + thinking)
                    for part in content:
                        if isinstance(part, dict):
                            if part.get("type") == "text":
                                text_content = part.get("text", "")
                                if text_content:
                                    full_response += text_content

                                    # Collect for history
                                    if current_text_part is None:
                                        current_text_part = {"type": "text", "content": text_content}
                                        message_parts.append(current_text_part)
                                    else:
                                        current_text_part["content"] += text_content

                                    yield {
                                        "event": "text",
                                        "data": {"content": text_content}
                                    }
                            elif part.get("type") == "thinking":
                                thinking_content = part.get("thinking", "")
                                if thinking_content:
                                    # Collect for history
                                    message_parts.append({
                                        "type": "thinking",
                                        "content": thinking_content
                                    })

                                    yield {
                                        "event": "thinking",
                                        "data": {"content": thinking_content}
                                    }
                elif isinstance(content, str) and content:
                    # Simple string content
                    full_response += content

                    # Collect for history
                    if current_text_part is None:
                        current_text_part = {"type": "text", "content": content}
                        message_parts.append(current_text_part)
                    else:
                        current_text_part["content"] += content

                    yield {
                        "event": "text",
                        "data": {"content": content}
                    }

            # 2. Extract tool calls
            tool_calls = None
            if hasattr(msg_obj, 'tool_calls'):
                tool_calls = msg_obj.tool_calls
            elif isinstance(msg_obj, dict):
                kwargs = msg_obj.get('kwargs', {})
                tool_calls = kwargs.get('tool_calls')

            if tool_calls:
                # IMPORTANT: Reset current_text_part to create a new text segment after tool calls
                # This ensures chronological order: text -> tool_call -> text
                current_text_part = None

                print(f"[DEBUG] Received {len(tool_calls)} tool_call(s) in this chunk")
                for tool_call in tool_calls:
                    # Handle both dict and object formats
                    if isinstance(tool_call, dict):
                        tool_id = tool_call.get('id')
                        tool_name = tool_call.get('name', '')
                        tool_args = tool_call.get('args', {})
                    else:
                        # Handle ToolCall object
                        tool_id = getattr(tool_call, 'id', None)
                        tool_name = getattr(tool_call, 'name', '')
                        tool_args = getattr(tool_call, 'args', {})

                    # VALIDATION: Skip malformed tool calls (empty or whitespace-only names)
                    if not tool_name or not tool_name.strip():
                        print(f"[DEBUG] Skipping malformed tool call: id={tool_id}, name='{tool_name}'")
                        continue

                    # Generate stable ID if missing
                    if not tool_id:
                        tool_id = f"{tool_name}:{hash(str(tool_args))}"

                    # DEDUPLICATION: Update existing tool call if it exists (LangGraph sends multiple chunks)
                    if tool_id in active_tool_calls:
                        print(f"[DEBUG] Updating existing tool call: {tool_id} with args={tool_args}")
                        # Find and update the existing tool_call_part
                        if tool_id in tool_calls_map:
                            existing_part = tool_calls_map[tool_id]
                            # Update args if new args are more complete (not empty)
                            if tool_args and tool_args != {}:
                                existing_part["args"] = tool_args
                                print(f"[DEBUG] Updated args for {tool_id}: {tool_args}")
                        continue

                    print(f"[DEBUG] Valid tool call: id={tool_id}, name={tool_name}, args={tool_args}")

                    # Track this tool call
                    active_tool_calls[tool_id] = tool_name

                    # Collect for history
                    tool_call_part = {
                        "type": "tool_call",
                        "id": tool_id,
                        "tool_name": tool_name,
                        "args": tool_args,
                        "status": "pending"
                    }
                    tool_calls_map[tool_id] = tool_call_part
                    message_parts.append(tool_call_part)

                    # Emit tool_start event
                    yield {
                        "event": "tool_start",
                        "data": {
                            "id": tool_id,
                            "tool_name": tool_name,
                            "args": tool_args
                        }
                    }

            # 2.5. Process tool_call_chunks to accumulate streaming args
            tool_call_chunks = None
            if hasattr(msg_obj, 'tool_call_chunks'):
                tool_call_chunks = msg_obj.tool_call_chunks
            elif isinstance(msg_obj, dict):
                kwargs = msg_obj.get('kwargs', {})
                tool_call_chunks = kwargs.get('tool_call_chunks')

            if tool_call_chunks:
                for chunk in tool_call_chunks:
                    # Extract chunk data
                    if isinstance(chunk, dict):
                        chunk_id = chunk.get('id')
                        chunk_name = chunk.get('name')
                        chunk_args = chunk.get('args', '')
                        chunk_index = chunk.get('index', 0)
                    else:
                        chunk_id = getattr(chunk, 'id', None)
                        chunk_name = getattr(chunk, 'name', None)
                        chunk_args = getattr(chunk, 'args', '')
                        chunk_index = getattr(chunk, 'index', 0)

                    # Find the tool call by index (chunks usually use index instead of id)
                    # Map index to the tool call we created earlier
                    if chunk_index == 0 and len(active_tool_calls) > 0:
                        # Get the first (or latest) tool call
                        tool_id = list(active_tool_calls.keys())[-1] if active_tool_calls else None

                        if tool_id and chunk_args:
                            # Initialize buffer if not exists
                            if tool_id not in tool_call_args_buffer:
                                tool_call_args_buffer[tool_id] = ""

                            # Accumulate args string
                            tool_call_args_buffer[tool_id] += chunk_args

                            # Try to parse accumulated JSON
                            try:
                                import json
                                parsed_args = json.loads(tool_call_args_buffer[tool_id])

                                # Update the tool_call_part with parsed args
                                if tool_id in tool_calls_map:
                                    tool_calls_map[tool_id]["args"] = parsed_args
                                    print(f"[DEBUG] Parsed complete args for {tool_id}: {parsed_args}")

                                    # Emit updated tool_start with complete args
                                    yield {
                                        "event": "tool_start",
                                        "data": {
                                            "id": tool_id,
                                            "tool_name": tool_calls_map[tool_id]["tool_name"],
                                            "args": parsed_args
                                        }
                                    }
                            except json.JSONDecodeError:
                                # Not yet complete JSON, keep accumulating
                                print(f"[DEBUG] Accumulating args for {tool_id}: '{tool_call_args_buffer[tool_id]}'")

            # 3. Extract tool results (ToolMessage)
            msg_type = None
            if hasattr(msg_obj, 'type'):
                msg_type = msg_obj.type
            elif isinstance(msg_obj, dict):
                msg_type = msg_obj.get('type')

            if msg_type == 'tool':
                # This is a ToolMessage with execution result
                tool_call_id = None
                result_content = None

                if hasattr(msg_obj, 'tool_call_id'):
                    tool_call_id = msg_obj.tool_call_id
                    result_content = msg_obj.content
                elif isinstance(msg_obj, dict):
                    tool_call_id = msg_obj.get('tool_call_id')
                    result_content = msg_obj.get('content')

                if tool_call_id:
                    tool_name = active_tool_calls.get(tool_call_id, "unknown")

                    # Determine if it's an error
                    is_error = False
                    if isinstance(result_content, str):
                        result_lower = result_content.lower()
                        is_error = (
                            result_lower.startswith("error") or
                            "error" in result_lower
                        )

                    # Update tool_calls_map for history
                    if tool_call_id in tool_calls_map:
                        tool_calls_map[tool_call_id]["result"] = str(result_content) if result_content else ""
                        tool_calls_map[tool_call_id]["status"] = "error" if is_error else "success"

                    # Emit tool_end event
                    yield {
                        "event": "tool_end",
                        "data": {
                            "id": tool_call_id,
                            "tool_name": tool_name,
                            "result": str(result_content) if result_content else "",
                            "status": "error" if is_error else "success"
                        }
                    }

                    # Remove from active tracking
                    active_tool_calls.pop(tool_call_id, None)

    except Exception as e:
        print(f"Agent streaming error: {e}")
        import traceback
        traceback.print_exc()
        error_msg = "Sorry, I had a little hiccup. Try again? 🎧"
        full_response = error_msg
        yield {
            "event": "text",
            "data": {"content": error_msg}
        }

    # If no response was generated, use fallback
    if not full_response:
        fallback_msg = "I'm here to help with your music!"
        full_response = fallback_msg
        yield {
            "event": "text",
            "data": {"content": fallback_msg}
        }

    # Add messages to history with complete structure
    session.add_message("user", content=message)
    print(f"[DEBUG] Added user message: {message[:50]}...")

    # Save agent message with parts (or fallback to content if no parts)
    if message_parts:
        print(f"[DEBUG] Collected {len(message_parts)} message parts")
        print(f"[DEBUG] Message parts structure: {[p.get('type') for p in message_parts]}")
        session.add_message("agent", parts=message_parts)
    else:
        # Fallback to simple text if no parts were collected
        print(f"[DEBUG] No message parts collected, using full_response: {full_response[:50]}...")
        session.add_message("agent", content=full_response)

    print(f"[DEBUG] Session now has {len(session.chat_history)} messages")

    # Persist state (title generation is async in background)
    print(f"[DEBUG] Calling update_session for session {session.session_id}")
    await store.update_session(db, session, user_id)
    print("[DEBUG] update_session completed")

    # Send completion signal with updated state
    # Note: Actions are now streamed in real-time via "custom" stream mode, so we no longer include them here
    yield {
        "event": "done",
        "data": {
            "session_id": session.session_id,
            "actions": [],  # Actions are now streamed in real-time
            "state": {
                "current_track": session.current_track.model_dump() if session.current_track else None,
                "playlist": [t.model_dump() for t in session.playlist],
                "is_playing": session.is_playing,
                "playback_position": session.playback_position
            }
        }
    }


