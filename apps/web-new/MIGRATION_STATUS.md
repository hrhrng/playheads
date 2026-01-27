# Frontend Migration Status: TanStack Start + TypeScript

## Overview
This document tracks the progress of migrating the frontend from Vite + React (JS) to TanStack Start + Vite + TypeScript. The new application is located in `apps/web-new`.

## Tech Stack
- **Framework**: TanStack Start (SSR, Server Functions)
- **Router**: TanStack Router (File-based routing)
- **State Management**: Zustand (Client state), TanStack Query (Server state - planned)
- **Styling**: Tailwind CSS v4
- **Auth**: Supabase Auth
- **Language**: TypeScript

## Progress Checklist

### 1. Infrastructure & Config
- [x] Project initialized (`apps/web-new`)
- [x] `vite.config.ts` configured with TanStack Start plugin
- [x] `tailwind.config.js` (using v4 CSS config in `src/styles.css`)
- [x] `package.json` dependencies defined

### 2. State Management
- [x] `src/store/chatStore.ts`: Ported from `chatStore.js`. Typed interfaces for Messages, Parts, etc.
- [x] `src/store/authStore.ts`: Created new store for Supabase session management.

### 3. Hooks
- [x] `src/hooks/useAppleMusic.ts`: Ported and typed. Added `MusicKit` type definitions.
- [x] `src/hooks/useChat.ts`: Ported. Adapted navigation logic for TanStack Router.
- [x] `src/hooks/useChatHelpers.ts`: Ported `useInitialMessage`, `useAutoResizeTextarea`, `useAutoScroll`.

### 4. Components
- **Layout & Auth**
    - [x] `src/components/AppLayout.tsx`: Main shell.
    - [x] `src/components/LoginScreen.tsx`: Supabase Magic Link login.
    - [x] `src/components/AppleMusicLinkOverlay.tsx`: Modal for linking Apple Music.
    - [x] `src/components/SkeletonLoader.tsx`
- **Chat**
    - [x] `src/components/ChatInterface.tsx`: Main coordinator.
    - [x] `src/components/NewChatView.tsx`: Empty state view.
    - [x] `src/components/chat/MessageList.tsx`: Message renderer.
    - [x] `src/components/chat/ChatInput.tsx`: Input area.
    - [x] `src/components/chat/TranscriptOverlay.tsx`: History view.
    - [x] `src/components/chat/ToolCall.tsx`: Tool execution visualizer.
    - [x] `src/components/chat/ThinkingProcess.tsx`: CoT visualizer.
    - [x] `src/components/chat/MarkdownMessage.tsx`: React Markdown wrapper.
- **Music Player**
    - [x] `src/components/RecordPlayer.tsx`: Visual player.
    - [x] `src/components/PlaylistSidebar.tsx`: Queue management.
    - [x] `src/components/DeleteConfirmDialog.tsx`: Modal.

### 5. Routing (TanStack Router)
- [x] `src/routes/__root.tsx`: Root layout with Auth initialization and Context providers.
- [x] `src/routes/_layout.tsx`: Main app layout (Sidebar + Outlet). Handles global data fetching (conversations).
- [x] `src/routes/_layout/index.tsx`: Home route (New Chat).
- [x] `src/routes/_layout/chat.$id.tsx`: Active chat route.

## Current Status & Blockers

### Build/Install Issue
We are currently facing an NPM dependency resolution error regarding `@tanstack/start`.

**Error:**
```
npm error notarget No matching version found for @tanstack/start-plugin-core@1.151.4.
```

**Cause:**
The starter template or manual installation pulled in mismatched versions of TanStack packages. `@tanstack/react-router`, `@tanstack/react-start`, and their internal plugins need to be strictly version-aligned.

### Next Steps (for new session)

1.  **Fix Dependencies**:
    - Manually align all `@tanstack/*` packages in `apps/web-new/package.json` to the latest stable versions (check npm registry).
    - Recommended: Use `0.0.1-beta.x` or latest stable if available.
    - Run `npm install` in `apps/web-new`.

2.  **Verify Configuration**:
    - Check `tsconfig.json` to ensure `jsx: "react-jsx"` and path aliases (`@/*`) are correctly set up.

3.  **Environment Variables**:
    - Ensure `.env` is created in `apps/web-new` with:
        - `VITE_SUPABASE_URL`
        - `VITE_SUPABASE_ANON_KEY`
        - `VITE_APPLE_DEVELOPER_TOKEN`

4.  **Run Development Server**:
    - `cd apps/web-new && npm run dev`

5.  **Testing**:
    - Test Auth flow (Supabase).
    - Test Apple Music connection.
    - Test Chat functionality (streaming response).

## Directory Structure
```
apps/web-new/
├── src/
│   ├── components/     # UI Components
│   ├── hooks/          # React Hooks
│   ├── store/          # Global State (Zustand)
│   ├── utils/          # Helpers (Supabase)
│   ├── routes/         # File-based routes
│   │   ├── __root.tsx
│   │   ├── _layout.tsx
│   │   ├── _layout/index.tsx
│   │   └── _layout/chat.$id.tsx
│   ├── router.tsx      # Router instance
│   └── styles.css      # Tailwind setup
├── package.json
├── vite.config.ts
└── tsconfig.json
```
