# Playheads Mobile Chat (React Native)

JavaScript module that owns the chat + GenUI surface inside the SwiftUI iOS app.
Registered to `AppRegistry` as `MobileChat` (see `app.json`). SwiftUI creates an
`RCTRootView` for this name inside `ChatHostRepresentable`
(`apps/ios/MusicAgent/ContentView.swift`).

## Why React Native (not pure Swift)

Agent-SDK and the GenUI toolchain are JS-only. Rather than reimplement both in
Swift, we host a small RN surface for the pieces that talk to the agent worker
(`playheads.ai/api`) and render streamed components.

Everything outside chat — mood feed, MusicKit, AVPlayer, artwork-palette
clustering — stays native SwiftUI.

## Status

Scaffolding only. `App.tsx` is a placeholder composer + message list that
round-trips `POST /api/chat` with the current track context. Streaming / GenUI
cards land later once the agent-worker side exposes the SSE endpoint.

The native side (`ChatHostRepresentable`) currently renders a placeholder
`UILabel`. Swapping it for a real `RCTRootView` is the next step — see below.

## Integration steps (next session)

1. `pnpm install` at repo root — brings in `react`, `react-native`, babel,
   metro.
2. Add a `Podfile` at `apps/ios/` and run `pod install`. Skeleton:

   ```ruby
   require_relative '../mobile-chat/node_modules/react-native/scripts/react_native_pods'
   platform :ios, '17.0'
   prepare_react_native_project!

   target 'MusicAgent' do
     config = use_native_modules!
     use_react_native!(
       :path => '../mobile-chat/node_modules/react-native',
       :hermes_enabled => true,
     )
   end
   ```

3. Update `apps/ios/project.yml` to pull the generated `MusicAgent.xcworkspace`
   into the build (xcodegen has a `scheme` hook for this) and add pod-install
   paths to `FRAMEWORK_SEARCH_PATHS`.
4. Replace `ChatHostRepresentable.makeUIViewController` with:

   ```swift
   import React
   ...
   let jsCodeLocation = URL(string: "http://localhost:8081/index.bundle?platform=ios")!
   let bridge = RCTBridge(bundleURL: jsCodeLocation, moduleProvider: nil, launchOptions: nil)
   let rootView = RCTRootView(
     bridge: bridge!,
     moduleName: "MobileChat",
     initialProperties: [
       "trackId": track?.trackId ?? "",
       "songName": track?.songName ?? "",
       "artist": track?.artist ?? ""
     ]
   )
   rootView.backgroundColor = .clear
   let vc = UIViewController()
   vc.view = rootView
   return vc
   ```

5. Run Metro: `pnpm --filter @playheads/mobile-chat start` in one terminal,
   build the iOS app in Xcode (not via `xcodebuild` CLI alone — the Metro
   bundler needs to be reachable).

## Dev commands

```sh
# from repo root
pnpm --filter @playheads/mobile-chat start   # Metro
pnpm --filter @playheads/mobile-chat tsc     # type-check
```
