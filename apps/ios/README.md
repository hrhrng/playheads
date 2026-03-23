# Playheads iOS App

Native SwiftUI iOS app for Playheads — your AI-powered music companion.

## Requirements

- Xcode 15.4+
- iOS 17.0+
- Apple Developer account (for MusicKit entitlement)

## Setup

1. Open `MusicAgent/MusicAgent.xcodeproj` in Xcode.
2. Set your Development Team in Signing & Capabilities.
3. Enable the MusicKit capability (entitlement is pre-configured).
4. Build and run on a device or simulator.

## Architecture

- **Pattern**: MVVM with Swift Concurrency
- **UI**: SwiftUI
- **Networking**: URLSession + native WebSocket
- **Music**: Native MusicKit framework
- **Auth**: Keychain-based session persistence

### Project Structure

```
MusicAgent/
├── Config/          # App configuration (API URLs, environment)
├── Models/          # Data models (Conversation, Message, Track, Profile)
├── Services/        # Network & business logic
│   ├── APIClient    # HTTP client with cookie-based auth
│   ├── AuthService  # Authentication (magic link, Apple, Google)
│   ├── ChatService  # WebSocket agent communication
│   ├── MusicService # MusicKit wrapper
│   └── ...
├── ViewModels/      # MVVM view models
├── Views/           # SwiftUI views
│   ├── Auth/        # Login, waitlist
│   ├── Chat/        # Chat interface
│   ├── Player/      # Record player, controls, now playing
│   ├── Queue/       # Playlist/queue management
│   ├── Conversations/ # History
│   └── Settings/    # Profile & settings
└── Theme/           # Colors, fonts
```

## Configuration

The app uses configurable API endpoints:

- **Debug**: Defaults to `http://localhost:8787`
- **Release**: Defaults to `https://api.playheads.ai`
- **Override**: Set custom URLs in Settings (debug builds only)

## Features

- AI-powered music chat agent
- Apple Music playback via native MusicKit
- Streaming chat with tool call visualization
- Global queue management (synced across devices)
- Conversation history with pin/rename/delete
- Apple Sign In + email magic link authentication
- Record player visualization with playback controls
