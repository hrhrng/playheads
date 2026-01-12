"""
Music Agent with LangChain Tools (v0.1 API)
"""
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain.tools import Tool
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from apps.backend.state import store


# =============================================================================
# Tool Functions
# =============================================================================

def _search_music(query: str) -> str:
    """Search for music tracks."""
    return f"To search for '{query}', I'll ask the user's device to search Apple Music. The results will appear in the UI."


def _get_now_playing() -> str:
    """Get currently playing track."""
    session = store.get_session()
    if session.current_track:
        t = session.current_track
        return f"Now playing: {t.name} by {t.artist}" + (f" from album {t.album}" if t.album else "")
    return "Nothing is currently playing."


def _get_playlist() -> str:
    """Get the current playlist."""
    session = store.get_session()
    if not session.playlist:
        return "The playlist is empty."
    
    lines = [f"Playlist ({len(session.playlist)} tracks):"]
    for i, track in enumerate(session.playlist):
        prefix = "▶ " if session.current_track and track.id == session.current_track.id else "  "
        lines.append(f"{prefix}{i+1}. {track.name} - {track.artist}")
    return "\n".join(lines)


def _play_track(index: str) -> str:
    """Play a track by index (1-indexed)."""
    try:
        idx = int(index)
    except:
        return "Please provide a valid track number."
    
    session = store.get_session()
    if not session.playlist:
        return "Playlist is empty."
    
    if idx < 1 or idx > len(session.playlist):
        return f"Invalid track number. Playlist has {len(session.playlist)} tracks."
    
    track = session.playlist[idx - 1]
    return f"ACTION:PLAY_INDEX:{idx - 1}|Playing {track.name} by {track.artist}"


def _skip_next(_: str = "") -> str:
    """Skip to next track."""
    session = store.get_session()
    if not session.playlist:
        return "Playlist is empty."
    
    if not session.current_track:
        return "ACTION:PLAY_INDEX:0|Starting playlist from the beginning"
    
    current_idx = next(
        (i for i, t in enumerate(session.playlist) if t.id == session.current_track.id),
        -1
    )
    
    next_idx = current_idx + 1
    if next_idx >= len(session.playlist):
        return "Already at the last track."
    
    next_track = session.playlist[next_idx]
    return f"ACTION:PLAY_INDEX:{next_idx}|Skipping to {next_track.name} by {next_track.artist}"


def _add_to_playlist(track_info: str) -> str:
    """Add a track to playlist. Input: 'track name - artist'"""
    return f"ACTION:SEARCH_AND_ADD:{track_info}|I'll add '{track_info}' to your playlist."


def _remove_from_playlist(index: str) -> str:
    """Remove track by index (1-indexed)."""
    try:
        idx = int(index)
    except:
        return "Please provide a valid track number."
    
    session = store.get_session()
    if not session.playlist:
        return "Playlist is empty."
    
    if idx < 1 or idx > len(session.playlist):
        return f"Invalid track number. Playlist has {len(session.playlist)} tracks."
    
    track = session.playlist[idx - 1]
    return f"ACTION:REMOVE_INDEX:{idx - 1}|Removed {track.name} by {track.artist}"


# =============================================================================
# Agent Setup
# =============================================================================

SYSTEM_PROMPT = """You are a friendly music DJ assistant called "Playhead DJ". You help users discover and play music.

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


def create_agent():
    """Create the music agent."""
    llm = ChatOpenAI(temperature=0.7, model="gpt-4o-mini")
    
    tools = [
        Tool(name="search_music", func=_search_music, description="Search for music tracks. Input: search query."),
        Tool(name="get_now_playing", func=_get_now_playing, description="Get info about the currently playing track."),
        Tool(name="get_playlist", func=_get_playlist, description="Get the current playlist/queue."),
        Tool(name="play_track", func=_play_track, description="Play a track by its position number (1-indexed)."),
        Tool(name="skip_next", func=_skip_next, description="Skip to the next track."),
        Tool(name="add_to_playlist", func=_add_to_playlist, description="Add a track. Input: 'track name - artist'."),
        Tool(name="remove_from_playlist", func=_remove_from_playlist, description="Remove track by position number."),
    ]
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        MessagesPlaceholder(variable_name="chat_history"),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])
    
    agent = create_openai_tools_agent(llm, tools, prompt)
    executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
    
    return executor


def run_agent(message: str, session_id: str = None) -> dict:
    """Run the agent with a user message."""
    session = store.get_session(session_id)
    
    # Add user message to history
    session.add_message("user", message)
    
    # Create agent
    agent = create_agent()
    
    # Build chat history for LLM
    from langchain_core.messages import HumanMessage, AIMessage
    chat_history = []
    for msg in session.chat_history[-10:]:
        if msg.role == "user":
            chat_history.append(HumanMessage(content=msg.content))
        else:
            chat_history.append(AIMessage(content=msg.content))
    
    # Run agent with error handling
    try:
        result = agent.invoke({
            "input": message,
            "chat_history": chat_history[:-1],
            "state_context": session.get_context_summary(),
        })
        response = result["output"]
    except Exception as e:
        print(f"Agent error: {e}")
        response = "Sorry, I had a little hiccup. Try again? 🎧"
    
    # Parse actions
    actions = []
    if "ACTION:" in response:
        parts = response.split("|")
        for part in parts:
            if part.startswith("ACTION:"):
                actions.append(part)
        response = parts[-1] if parts else response
    
    # Add response to history
    session.add_message("agent", response)
    store.update_session(session)
    
    return {
        "response": response,
        "actions": actions,
        "session_id": session.session_id
    }
