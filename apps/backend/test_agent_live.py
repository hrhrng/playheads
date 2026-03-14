"""
Live integration test — calls the real LLM and dumps every raw chunk from LangGraph.

Run:
    uv run --project apps/backend --extra dev pytest apps/backend/test_agent_live.py -v -s

Requires real API keys in .env (ANTHROPIC_API_KEY or OPENAI_API_KEY).
"""
from __future__ import annotations

import json
import os
import uuid

import pytest

pytestmark = pytest.mark.skipif(
    not os.getenv("ANTHROPIC_API_KEY") and not os.getenv("OPENAI_API_KEY"),
    reason="Live tests require API keys"
)
from langgraph.checkpoint.memory import MemorySaver

from apps.backend.agent import create_music_agent, _process_astream


@pytest.mark.asyncio
async def test_dump_raw_chunks():
    """Create a real agent graph, send a simple message, dump every chunk."""
    checkpointer = MemorySaver()
    graph = create_music_agent(
        state_context="No track playing. Empty playlist.",
        checkpointer=checkpointer,
    )
    config = {"configurable": {"thread_id": str(uuid.uuid4())}}

    print("\n" + "=" * 80)
    print("RAW CHUNKS FROM LANGGRAPH astream(stream_mode=['messages', 'custom'])")
    print("=" * 80)

    i = 0
    async for mode, chunk in graph.astream(
        {"messages": [{"role": "user", "content": "你好，简单介绍一下你自己，一句话就行"}]},
        config=config,
        stream_mode=["messages", "custom"],
    ):
        i += 1
        print(f"\n--- chunk #{i}  mode={mode} ---")

        # Try to serialize the chunk fully
        if hasattr(chunk, 'to_json'):
            print(json.dumps(chunk.to_json(), ensure_ascii=False, default=str))
        elif isinstance(chunk, (list, tuple)):
            for j, item in enumerate(chunk):
                if hasattr(item, 'to_json'):
                    print(f"  [{j}] {json.dumps(item.to_json(), ensure_ascii=False, default=str)}")
                else:
                    print(f"  [{j}] {json.dumps(item, ensure_ascii=False, default=str)}")
        else:
            print(json.dumps(chunk, ensure_ascii=False, default=str))

    print("\n" + "=" * 80)
    print(f"Total chunks: {i}")
    print("=" * 80)


@pytest.mark.asyncio
async def test_dump_processed_events():
    """Same real LLM call, but through _process_astream to see final SSE events."""
    checkpointer = MemorySaver()
    graph = create_music_agent(
        state_context="No track playing. Empty playlist.",
        checkpointer=checkpointer,
    )
    config = {"configurable": {"thread_id": str(uuid.uuid4())}}

    print("\n" + "=" * 80)
    print("PROCESSED SSE EVENTS FROM _process_astream")
    print("=" * 80)

    events = []
    async for event in _process_astream(
        graph,
        {"messages": [{"role": "user", "content": "你好，简单介绍一下你自己，一句话就行"}]},
        config,
    ):
        events.append(event)
        print(f"\n{json.dumps(event, ensure_ascii=False, default=str)}")

    print("\n" + "=" * 80)
    print(f"Total events: {len(events)}")
    event_types = [e.get('event', '?') for e in events]
    print(f"Event types: {event_types}")
    print(f"Has thinking: {'thinking' in event_types}")
    print("=" * 80)
