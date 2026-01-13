"""
Music Agent with LangChain 1.0 API
"""
from langchain.agents import create_agent
from langchain.tools import tool

from apps.backend.state import store


# =============================================================================
# Tool Functions (using @tool decorator for LangChain 1.0)
# =============================================================================

@tool
def search_music(query: str) -> str:
    """Search for music tracks. Input: search query."""
    return f"To search for '{query}', I'll ask the user's device to search Apple Music. The results will appear in the UI."


@tool
def get_now_playing() -> str:
    """Get info about the currently playing track."""
    # This will be called with injected session via state
    return "Use the current state context to see what's playing."


@tool
def get_playlist() -> str:
    """Get the current playlist/queue."""
    return "Use the current state context to see the playlist."


@tool
def play_track(index: str) -> str:
    """Play a track by its position number (1-indexed)."""
    try:
        idx = int(index)
    except:
        return "Please provide a valid track number."
    return f"ACTION:PLAY_INDEX:{idx - 1}|Playing track at position {idx}"


@tool
def skip_next() -> str:
    """Skip to the next track."""
    return "ACTION:SKIP_NEXT|Skipping to next track"


@tool
def add_to_playlist(track_info: str) -> str:
    """Add a track to playlist. Input: 'track name - artist'."""
    return f"ACTION:SEARCH_AND_ADD:{track_info}|I'll add '{track_info}' to your playlist."


@tool
def remove_from_playlist(index: str) -> str:
    """Remove track by position number (1-indexed)."""
    try:
        idx = int(index)
    except:
        return "Please provide a valid track number."
    return f"ACTION:REMOVE_INDEX:{idx - 1}|Removed track at position {idx}"


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
    
    agent = create_agent(
        model="openai:gpt-4o-mini",
        tools=TOOLS,
        system_prompt=system_prompt
    )
    
    return agent


async def run_agent(db, message: str, session_id: str, user_id: str = None) -> dict:
    """Run the agent with a user message."""
    # Get session from DB
    session = await store.get_session(db, session_id, user_id)
    
    # Get state context before adding new message
    state_context = session.get_context_summary() if hasattr(session, 'get_context_summary') else "No state available"
    
    # Create agent with current session state
    agent = create_music_agent(state_context)
    
    # Build messages for agent from existing chat history (before current message)
    messages = []
    # Send last 10 messages for context
    for msg in session.chat_history[-10:]:
        if msg.role == "user":
            messages.append({"role": "user", "content": msg.content})
        else:
            messages.append({"role": "assistant", "content": msg.content})
    
    # Add current message to the messages list for agent
    messages.append({"role": "user", "content": message})
    print(messages)
    # Run agent with error handling
    try:
        import asyncio
        result = await asyncio.to_thread(
            agent.invoke,
            {"messages": messages}
        )
        # Extract response from the result
        response_messages = result.get("messages", [])
        response = ""
        if response_messages:
            last_msg = response_messages[-1]
            if hasattr(last_msg, 'content'):
                response = last_msg.content
            elif isinstance(last_msg, dict):
                response = last_msg.get('content', '')
        
        if not response:
            response = "I'm here to help with your music! What would you like to do?"
            
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
    
    # Add both messages to history
    session.add_message("user", message)
    session.add_message("agent", response)
    
    # Persist state
    await store.update_session(db, session, user_id)
    
    return {
        "response": response,
        "actions": actions,
        "session_id": session.session_id
    }
