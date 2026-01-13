"""
Music Agent with LangChain 1.0 API
"""
import os
from contextvars import ContextVar
from typing import Optional
from langchain.agents import create_agent
from langchain.tools import tool
from langchain_openai import ChatOpenAI

from apps.backend.state import store, SessionState


# =============================================================================
# Context Variables for Session State
# =============================================================================

# Context variable to pass session state to tools in async context
_session_context: ContextVar[Optional[SessionState]] = ContextVar('_session_context', default=None)


# =============================================================================
# Tool Functions (using @tool decorator for LangChain 1.0)
# =============================================================================

@tool
def search_music(query: str) -> str:
    """Search for music tracks on Apple Music. Input: search query string."""
    session = _session_context.get()

    if session:
        session.pending_actions.append({
            "type": "SEARCH",
            "params": {"query": query}
        })

    return f"Searching Apple Music for '{query}'"


@tool
def get_now_playing() -> str:
    """Get information about the currently playing track."""
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
def get_playlist() -> str:
    """Get the current playlist/queue of tracks."""
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
def play_track(index: str) -> str:
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

    # Add action to pending_actions
    session.pending_actions.append({
        "type": "PLAY_INDEX",
        "params": {"index": idx - 1}
    })

    return f"Playing '{track.name}' by {track.artist}"


@tool
def skip_next() -> str:
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

    # Add action to pending_actions
    session.pending_actions.append({
        "type": "SKIP_NEXT",
        "params": {}
    })

    return f"Skipping to '{next_track.name}' by {next_track.artist}"


@tool
def add_to_playlist(track_info: str) -> str:
    """Search for a track and add it to the playlist.

    Args:
        track_info: Track name and artist in format 'track name - artist'

    Returns:
        Confirmation message
    """
    session = _session_context.get()

    if not track_info or '-' not in track_info:
        return "Please provide track info in the format: 'track name - artist'"

    # Add action to pending_actions
    if session:
        session.pending_actions.append({
            "type": "SEARCH_AND_ADD",
            "params": {"query": track_info}
        })

    return f"Searching for '{track_info}' to add to your playlist"


@tool
def remove_from_playlist(index: str) -> str:
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

    track = session.playlist[idx - 1]

    # Add action to pending_actions
    session.pending_actions.append({
        "type": "REMOVE_INDEX",
        "params": {"index": idx - 1}
    })

    return f"Removing '{track.name}' by {track.artist} from playlist"


# =============================================================================
# System Prompt Template
# =============================================================================

SYSTEM_PROMPT_TEMPLATE = """You are a friendly music DJ assistant called "Playhead DJ". You help users discover and play music.

Current State:
{state_context}

You have access to tools to control music playback and manage the playlist:
- search_music: Search for music
- get_now_playing: Check what's currently playing
- get_playlist: See the queue
- play_track: Play a specific track by number (1-indexed)
- skip_next: Skip to next track
- add_to_playlist: Add music (format: "track name - artist")
- remove_from_playlist: Remove track by number (1-indexed)

Be conversational and fun! Add music-related commentary. Keep responses concise."""


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
            messages.append({"role": "assistant", "content": msg.content})

    # Add current message
    messages.append({"role": "user", "content": message})

    # Stream agent response using LangChain 1.0 API with token-level streaming
    full_response = ""
    actions = []  # Track actions extracted from tool responses
    tool_calls_detected = []
    from langchain_core.load import dumps
    print(dumps(messages))
    try:
        # Use stream_mode="messages" for token-level streaming (typewriter effect)
        async for chunk in agent_graph.astream(
            {"messages": messages},
            stream_mode="messages"
        ):
            # LangChain returns chunks as arrays: [message_object, metadata]
            # Extract content from the message object
            content_chunk = ""
            msg_obj = None

            if isinstance(chunk, (list, tuple)) and len(chunk) > 0:
                msg_obj = chunk[0]
                # Check if it's a dict with kwargs.content
                if isinstance(msg_obj, dict):
                    kwargs = msg_obj.get('kwargs', {})
                    content_chunk = kwargs.get('content', '')
                    # Check for tool calls in the message
                    if 'tool_calls' in kwargs and kwargs['tool_calls']:
                        tool_calls_detected.extend(kwargs['tool_calls'])
                # Or if it's an object with content attribute
                elif hasattr(msg_obj, 'content'):
                    content_chunk = msg_obj.content
                    if hasattr(msg_obj, 'tool_calls') and msg_obj.tool_calls:
                        tool_calls_detected.extend(msg_obj.tool_calls)
            elif hasattr(chunk, 'content'):
                content_chunk = chunk.content
                if hasattr(chunk, 'tool_calls') and chunk.tool_calls:
                    tool_calls_detected.extend(chunk.tool_calls)
            elif isinstance(chunk, dict):
                # Fallback: try kwargs.content or content directly
                kwargs = chunk.get('kwargs', {})
                content_chunk = kwargs.get('content') or chunk.get('content', '')
                if 'tool_calls' in kwargs and kwargs['tool_calls']:
                    tool_calls_detected.extend(kwargs['tool_calls'])

            # Yield non-empty content chunks
            if content_chunk:
                full_response += content_chunk
                yield {"content": content_chunk, "done": False}

    except Exception as e:
        print(f"Agent streaming error: {e}")
        import traceback
        traceback.print_exc()
        error_msg = "Sorry, I had a little hiccup. Try again? 🎧"
        full_response = error_msg
        yield {"content": error_msg, "done": False}

    # If no response was generated, use fallback
    if not full_response:
        fallback_msg = "I'm here to help with your music!"
        full_response = fallback_msg
        yield {"content": fallback_msg, "done": False}

    # Get pending actions from session (structured JSON)
    actions = session.pending_actions.copy() if session and session.pending_actions else []

    # Clear pending actions after retrieving them
    if session:
        session.pending_actions.clear()

    # Add messages to history
    session.add_message("user", message)
    session.add_message("agent", full_response)

    # Persist state (title generation is async in background)
    await store.update_session(db, session, user_id)

    # Send completion signal
    yield {
        "content": "",
        "done": True,
        "actions": actions,
        "session_id": session.session_id
    }


