"""
Conversation title generation using LLM
"""
from langchain_openai import ChatOpenAI
import os
import asyncio


async def generate_conversation_title(messages: list[dict], timeout: int = 5) -> str:
    """
    Generate a short, descriptive title from conversation messages using LLM.

    Args:
        messages: List of message dicts with 'role' and 'content' keys
        timeout: Maximum seconds to wait for title generation

    Returns:
        str: Generated title (max 50 chars) or default if generation fails
    """
    try:
        # Load OpenAI configuration
        api_key = os.getenv('OPENAI_API_KEY')
        base_url = os.getenv('OPENAI_BASE_URL')

        if not api_key:
            return "New Conversation"

        model = ChatOpenAI(
            model="kimi-k2-turbo-preview",
            api_key=api_key,
            base_url=base_url if base_url else None,
            temperature=0.7
        )

        # Build conversation context from first 5 messages
        conversation_text = "\n".join([
            f"{m.get('role', 'unknown')}: {m.get('content', '')}"
            for m in messages[:5]
        ])

        prompt = f"""Based on this music conversation, generate a short, descriptive title (max 5 words).
The title should capture the main topic or vibe.

Examples:
- "Chill Jazz Playlist"
- "90s Rock Recommendations"
- "Study Focus Music"
- "Workout Energy Mix"

Conversation:
{conversation_text}

Title (5 words max):"""

        # Run with timeout
        async def _generate():
            response = await model.ainvoke([{"role": "user", "content": prompt}])
            return response.content.strip()

        title = await asyncio.wait_for(_generate(), timeout=timeout)

        # Clean up title
        title = title.strip('"').strip("'").strip()

        # Limit length
        if len(title) > 50:
            title = title[:47] + "..."

        return title if title else "New Conversation"

    except asyncio.TimeoutError:
        print("Title generation timed out")
        return "New Conversation"
    except Exception as e:
        print(f"Title generation error: {e}")
        return "New Conversation"
