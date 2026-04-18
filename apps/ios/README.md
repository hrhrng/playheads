# Music Agent iOS App

This implementation uses SwiftUI.

## Setup

1. Open Xcode.
2. Create a new Project (App).
3. Name it "MusicAgent".
4. Replace the created files with the files in this directory.
   - `MusicAgentApp.swift` -> Entry point.
   - `ContentView.swift` -> Main UI (vertical mood-feed).
   - `Theme.swift` -> Mood palettes (Amber / Rain / Forest / Neon).
   - `Track.swift` -> `MoodTrack` model + `MockFeed` with mocked `trackId`s.

## Design

Implements `preview/mobile-moods-mixed.html` from the Playheads Design System.
Full-screen vertical feed of "album moods": each page's background is a heavy
blurred cluster of the cover's own colors, with a gradient cover, song + artist,
3-line lyrics (middle highlighted), progress bar, and a chat pill.

Requires iOS 17+ (uses `scrollTargetBehavior(.paging)`).
