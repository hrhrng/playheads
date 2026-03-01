# Playhead — AI Coding Agent Guide

## Project Overview

Monorepo with two apps: a **React frontend** and a **FastAPI + LangGraph backend**.
The app is a music DJ assistant that controls Apple Music playback via chat.

```
apps/
  web/          → React + Vite + TypeScript + Zustand + Tailwind
  backend/      → FastAPI + LangGraph agent + PostgreSQL (Supabase)
```

## Backend Module Map (`apps/backend/`)

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app — all HTTP endpoints, SSE streaming, error classification |
| `agent.py` | LangGraph music agent — tools, system prompt, streaming event processing |
| `state.py` | Pydantic models (`TrackInfo`, `Message`, `SessionState`) + `SessionStore` (DB-backed) |
| `models.py` | SQLAlchemy ORM — `Profile`, `Conversation`, `ConversationState` |
| `database.py` | Async engine + session factory, `get_db` dependency |
| `apple_music.py` | Apple Music API client + router for token-based endpoints |
| `title_generator.py` | LLM-powered conversation title generation (background task) |
| `minimax_client.py` | Minimax TTS client (experimental) |
| `error_codes.py` | Error code constants |
| `conftest.py` | Pytest config — path setup, shared fixtures, mock Apple Music + DuckDuckGo |

## Frontend Module Map (`apps/web/src/`)

| Path | Purpose |
|------|---------|
| `store/chatStore.ts` | Zustand store — messages, SSE streaming, line-buffer parsing |
| `config/api.ts` | API base URL configuration |
| `types/chat.d.ts` | Message types — `TextPart`, `ThinkingPart`, `ToolCallPart`, type guards |
| `types/errors.ts` | `ErrorCategory` enum + `ClassifiedError` interface |
| `types/index.d.ts` | Centralized type re-exports |
| `utils/errorHandling.ts` | `classifyError()` — maps errors to categories with retry/action hints |
| `components/` | React components (chat UI, player, sidebar) |
| `hooks/` | Custom hooks (MusicKit, auth, etc.) |

## Data Flow

### `/chat` — SSE Streaming Protocol

```
Frontend                    Backend
   │                           │
   ├─ POST /chat ────────────► │ run_agent_stream()
   │                           │   ├─ Persist user message
   │                           │   ├─ Create LangGraph agent
   │  ◄── event: thinking ──── │   │  (reasoning)
   │  ◄── event: tool_start ── │   │  (tool call begins)
   │  ◄── event: action ────── │   │  (fire-and-forget MusicKit action)
   │  ◄── event: tool_end ──── │   │  (tool result)
   │  ◄── event: text ──────── │   │  (streaming text tokens)
   │  ◄── event: done ──────── │   └─ Persist agent message
   │                           │
```

SSE events carry JSON data. The frontend accumulates `text` events into the current
message part, handles `tool_start`/`tool_end` for tool call cards, and executes
`action` events immediately on MusicKit.

### `/state/sync` — Context-Only Update

Only updates `context` (current_track, playlist, is_playing, playback_position) and
`last_synced_at`. **Never touches `messages`** — prevents race condition with agent
writing messages mid-stream via `/chat`.

### Message Persistence

- User messages: persisted by `/chat` before agent runs
- Agent messages: persisted by `/chat` after agent completes (in `done` event handler)
- `/state/sync` does NOT write messages

## Agent Tools

| Tool | Purpose | Side Effect |
|------|---------|-------------|
| `search_music(query)` | Search Apple Music catalog | None (read-only) |
| `get_now_playing()` | Get current track info from session context | None |
| `get_playlist()` | Get current playlist from session context | None |
| `play_track(index)` | Play track at 1-indexed position | Emits `play_track` action |
| `skip_next()` | Skip to next track | Emits `play_track` action |
| `add_to_queue(track_id)` | Fetch track by Apple Music ID, add to playlist | Emits `add_to_queue` action, mutates session.playlist |
| `remove_from_playlist(index)` | Remove track at 1-indexed position | Emits `remove_track` action, mutates session.playlist |
| `search_web(query)` | DuckDuckGo search for music discovery | None |

## Key Conventions

1. **Messages only persist through `/chat`** — the SSE stream handler in
   `run_agent_stream()` writes both user and agent messages. No other endpoint
   writes to the `messages` column.

2. **Fire-and-forget actions** — tools call `_emit_action()` which sends an SSE
   event to the frontend. The agent does NOT block waiting for confirmation.
   This avoids LangGraph's parallel-interrupt bug.

3. **Message format** — two formats coexist:
   - Legacy: `{role, content}` (plain text)
   - Modern: `{role, parts: [{type, content/tool_name/args/result}]}`
   Both are supported in frontend rendering and backend persistence.

4. **Session lifecycle** — `/session/create` pre-creates the DB records.
   `/chat` uses the existing session (creates lazily if missing).

5. **Checkpointer** — singleton `AsyncPostgresSaver` with connection pooling.
   One instance shared across all requests.

## Development Commands

```bash
make dev            # Start frontend + backend (parallel)
make dev-web        # Frontend only (Vite, port 5173)
make dev-backend    # Backend only (uvicorn, port 8001)
make install        # Install all dependencies

make test           # Run all tests (backend + frontend)
make test-backend   # Backend tests (pytest)
make test-web       # Frontend tests (vitest)

make lint           # Lint frontend (ESLint)
make type-check     # TypeScript type checking
make ci             # Full CI: lint + type-check + test

make clean          # Clean caches
```

## Testing

### Backend (`apps/backend/`)

Run: `make test-backend`

- **test_state.py** — Pydantic model unit tests + `SessionStore._hydrate_session()`
- **test_api.py** — FastAPI endpoint tests via `httpx.AsyncClient` + `ASGITransport`
  (no real server, no real DB)
- **test_agent.py** / **test_agent_multiturn.py** — Agent integration tests

Key fixtures in `conftest.py`:
- `api_client` — async HTTP client with mocked DB dependency
- `mock_store` — patched `SessionStore` methods
- `mock_apple_music` — fake Apple Music API
- `mock_ddgs` — fake DuckDuckGo search

All DB interactions are mocked — tests use a dummy `DATABASE_URL` and never
connect to a real database.

### Frontend (`apps/web/`)

Run: `make test-web`

- **store/__tests__/chatStore.test.ts** — Zustand store actions, SSE parsing,
  line-buffer fragmentation, history loading
- **utils/__tests__/errorHandling.test.ts** — `classifyError()` branch coverage
- **types/__tests__/chat.test.ts** — Type guard functions

Uses vitest with jsdom environment. Global setup in `src/test/setup.ts`.
