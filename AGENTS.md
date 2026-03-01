# Playhead — AI Coding Agent Guide

## Project Overview

Monorepo with three apps: a **React frontend**, a **FastAPI + LangGraph backend**, and a **SwiftUI iOS app**.
The app is a music DJ assistant that controls Apple Music playback via chat.

```
apps/
  web/          → React + Vite + TypeScript + Zustand + Tailwind
  backend/      → FastAPI + LangGraph agent + PostgreSQL (Supabase)
  ios/          → SwiftUI iOS app (minimal)
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
| `error_codes.py` | Error code constants (`AUTH_TOKEN_INVALID`, `RATE_LIMIT`, `SERVICE_UNAVAILABLE`, etc.) |
| `conftest.py` | Pytest config — path setup, shared fixtures, mock Apple Music + DuckDuckGo |
| `apply_migration.py` | Database migration script |
| `migrations/` | SQL migration files (e.g., `001_enhance_conversations.sql`) |

## Frontend Module Map (`apps/web/src/`)

| Path | Purpose |
|------|---------|
| `store/chatStore.ts` | Zustand store — messages, SSE streaming, line-buffer parsing |
| `config/api.ts` | API base URL configuration |
| `api/appleMusicAuth.ts` | Apple Music token validation + session management |
| `types/chat.d.ts` | Message types — `TextPart`, `ThinkingPart`, `ToolCallPart`, type guards |
| `types/api.d.ts` | API response types — `ChatRequest`, `SyncStateRequest`, `SessionInfo` |
| `types/apple-music.d.ts` | Apple Music types — `Track`, `SearchResponse`, `MusicSearchType` |
| `types/musicKit.d.ts` | MusicKit JS types — `MusicKitInstance`, `MediaItem`, event types |
| `types/global.d.ts` | App types — `SupabaseSession`, `Conversation`, `RouterLocationState` |
| `types/errors.ts` | `ErrorCategory` enum + `ClassifiedError` interface |
| `types/index.d.ts` | Centralized type re-exports |
| `utils/errorHandling.ts` | `classifyError()` — maps errors to categories with retry/action hints |
| `routes/index.tsx` | Route definitions — home (conversation list) + chat (detail) |

### Components (`components/`)

| Component | Purpose |
|-----------|---------|
| `AppLayout.tsx` | Main layout wrapper |
| `ChatInterface.tsx` | Chat UI container |
| `NewChatView.tsx` | New conversation view |
| `PlaylistSidebar.tsx` | Queue/playlist panel |
| `RecordPlayer.tsx` | Player UI with album artwork |
| `Waveform.tsx` | Audio visualizer |
| `SkeletonLoader.tsx` | Loading state placeholder |
| `ToastProvider.tsx` | Sonner toast notifications |
| `DeleteConfirmDialog.tsx` | Confirmation modal |
| `ErrorBoundary.tsx` | React error boundary |
| `Callback.tsx` | Auth callback handler |
| `chat/MessageList.tsx` | Rendered message list |
| `chat/ChatInput.tsx` | Message input field |
| `chat/MarkdownMessage.tsx` | Markdown rendering for messages |
| `chat/ToolCall.tsx` | Tool call card display |
| `chat/ThinkingProcess.tsx` | Agent thinking display (collapsible) |
| `chat/TranscriptOverlay.tsx` | Transcript view overlay |

### Hooks (`hooks/`)

| Hook | Purpose |
|------|---------|
| `useAppleMusic.ts` | MusicKit init, auth, playback control, queue management, real-time events |
| `useChat.ts` | Chat message handling |
| `useChatHelpers.ts` | Chat utility functions |
| `useNavSidebarState.ts` | Navigation sidebar state |
| `useSidebarState.ts` | General sidebar state |
| `useSpotifyPlayer.ts` | Spotify player (legacy/experimental) |

## API Endpoints

### Chat & State

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/chat` | Stream chat response via SSE |
| `GET` | `/state` | Get session state (playback + history) |
| `POST` | `/state/sync` | Sync playback context only (never touches messages) |
| `POST` | `/action/{action}` | Execute direct actions (play, skip_next, skip_prev) |

### Sessions & Conversations

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/session/create` | Create new session |
| `POST` | `/conversations/create` | Create new conversation |
| `GET` | `/conversations` | List user conversations |
| `PATCH` | `/conversations/{id}` | Update metadata (title, pinned, archived) |
| `DELETE` | `/conversations/{id}` | Delete conversation |

### Apple Music

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/apple-music/developer-token` | Get ES256-signed JWT token |
| `GET` | `/apple-music/catalog/search` | Search catalog |
| `GET` | `/apple-music/catalog/songs/{id}` | Get song by ID |
| `GET` | `/apple-music/catalog/albums/{id}` | Get album by ID |
| `GET` | `/apple-music/catalog/playlists/{id}` | Get playlist by ID |
| `GET` | `/apple-music/me/storefront` | Get user storefront |
| `GET` | `/apple-music/validate-token` | Validate user token |

### Health

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Root status |
| `GET` | `/health` | Health check |

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

## Message Format

Two formats coexist (both supported in frontend rendering and backend persistence):

**Legacy format:**
```json
{"role": "user|agent", "content": "text content"}
```

**Modern format:**
```json
{
  "role": "user|agent",
  "parts": [
    {"type": "text", "content": "..."},
    {"type": "thinking", "content": "..."},
    {"type": "tool_call", "id": "abc123", "tool_name": "search_music",
     "args": {"query": "jazz"}, "status": "pending|success|error", "result": "..."}
  ]
}
```

## Key Conventions

1. **Messages only persist through `/chat`** — the SSE stream handler in
   `run_agent_stream()` writes both user and agent messages. No other endpoint
   writes to the `messages` column.

2. **Fire-and-forget actions** — tools call `_emit_action()` which sends an SSE
   event to the frontend. The agent does NOT block waiting for confirmation.
   This avoids LangGraph's parallel-interrupt bug.

3. **Line-buffer SSE parsing** — the frontend accumulates SSE lines across TCP
   chunks to handle fragmentation. Tool calls are deduplicated by ID during
   streaming argument accumulation.

4. **Session lifecycle** — `/session/create` pre-creates the DB records.
   `/chat` uses the existing session (creates lazily if missing).

5. **Checkpointer** — singleton `AsyncPostgresSaver` with connection pooling
   (max_size=5). One instance shared across all requests, initialized on first use.

6. **Context variables** — `_session_context`, `_db_context`, `_user_id_context`
   are used to pass request-scoped data to LangGraph tool functions.

7. **Background title generation** — `title_generator.py` runs as `asyncio.create_task()`
   after messages 2 and every 10 messages. Max 5 words, 50 chars. Falls back to
   "New Conversation" on timeout/error.

8. **Async everything** — all DB operations use SQLAlchemy `AsyncSession` and
   `async_sessionmaker`. Database URL is converted for `asyncpg` driver.

## Environment Variables

### Backend

| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection (Supabase) | Yes |
| `OPENAI_API_KEY` | LLM API key (OpenAI/Kimi) | Yes |
| `OPENAI_BASE_URL` | Custom LLM base URL | No |
| `APPLE_MUSIC_TEAM_ID` | Apple Developer Team ID | Yes |
| `APPLE_MUSIC_KEY_ID` | Key ID from App Store Connect | Yes |
| `APPLE_MUSIC_PRIVATE_KEY` | ES256 private key (inline) | One of these |
| `APPLE_MUSIC_PRIVATE_KEY_PATH` | Path to ES256 private key file | One of these |
| `APPLE_MUSIC_DEVELOPER_TOKEN` | Pre-signed static token (overrides key-based signing) | No |
| `APPLE_MUSIC_TOKEN_TTL_SECONDS` | Token expiry in seconds (default: 3600) | No |

### Frontend

| Variable | Purpose | Required |
|----------|---------|----------|
| `VITE_API_BASE` | Backend URL (default: `http://localhost:8001`) | No |
| `VITE_SUPABASE_URL` | Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `VITE_MUSICKIT_DEVELOPER_TOKEN` | Apple MusicKit token | Yes |

## Database Schema

### Key Tables (SQLAlchemy ORM in `models.py`)

**Profile** — User accounts
- Links to Supabase auth, stores Apple Music user token

**Conversation** — Chat session metadata
- Fields: `title`, `message_count`, `last_message_preview`, `last_message_at`, `is_pinned`, `is_archived`
- Indexes: `(user_id, updated_at)`, `(user_id, is_pinned, updated_at)`

**ConversationState** — Persistent session state
- JSON columns: `messages[]`, `context{}`
- Stores both chat history and playback state (current_track, playlist, is_playing, position)

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

## CI/CD Pipeline (`.github/workflows/ci.yml`)

**Backend job** (Python 3.11):
- Install dependencies via `uv sync`
- Run `pytest` with mocked `DATABASE_URL`

**Frontend job** (Node 20):
- Install dependencies via `pnpm install --frozen-lockfile`
- Run ESLint
- Run TypeScript type-check
- Run Vitest

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

## Dependencies

### Backend (managed by `uv`, see `pyproject.toml`)

Core: `fastapi`, `uvicorn`, `langchain`, `langchain-openai`, `langgraph`,
`langgraph-checkpoint-postgres`, `sqlalchemy`, `asyncpg`, `httpx`, `PyJWT`,
`cryptography`, `duckduckgo-search`, `spotipy`

Dev: `pytest`, `pytest-asyncio`

### Frontend (managed by `pnpm`, see `apps/web/package.json`)

Core: `react@18`, `react-dom@18`, `react-router-dom@7`, `zustand@5`,
`react-markdown`, `remark-gfm`, `sonner`, `rc-slider`, `@supabase/supabase-js`

Dev: `typescript@5`, `vite@5`, `vitest`, `tailwindcss@3`, `eslint`

## Error Handling

### Backend Error Classification (`main.py`)

Errors are classified into categories for structured SSE error responses:
- `AUTH_TOKEN_INVALID` / `AUTH_TOKEN_EXPIRED` → action: `"reauth"`
- `RATE_LIMIT` → retryable: `true`
- `SERVICE_UNAVAILABLE` → retryable: `true`
- `VALIDATION_ERROR`, `NOT_FOUND`, `PERMISSION_DENIED` → not retryable

### Frontend Error Classification (`utils/errorHandling.ts`)

`classifyError()` maps HTTP status codes and error messages to `ErrorCategory`
enum values, each with retry hints and suggested user actions.
