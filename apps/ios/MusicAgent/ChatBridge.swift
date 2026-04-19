import Foundation
import React

/// RN → Swift channel. `apps/mobile-chat/App.tsx` runs `useAgentChat` headless
/// and calls into these methods whenever the UIMessage list changes or when a
/// server-side music tool dispatches an action that needs to execute locally
/// (play / queue / skip / remove).
///
/// Registered with the RN module system via `ChatBridge.m` so JS can reach it
/// as `NativeModules.ChatBridge`.
@objc(ChatBridge)
final class ChatBridge: NSObject {

    @objc static func requiresMainQueueSetup() -> Bool { true }

    @objc static func moduleName() -> String! { "ChatBridge" }

    /// Called from JS with the full UIMessage[] on every change. We translate
    /// to typed Swift `ChatMessage` values and push onto the store on main.
    @objc(updateMessages:)
    func updateMessages(_ messages: NSArray) {
        let decoded = messages.compactMap { (raw) -> ChatMessage? in
            guard let dict = raw as? [String: Any] else { return nil }
            return ChatMessage(uiMessageDict: dict)
        }
        DispatchQueue.main.async {
            ConversationStore.shared.replace(messages: decoded)
        }
    }

    /// Called from JS when the agent's tool result carries an `_action` field
    /// that should drive native playback (mirror of web's onData handling in
    /// `useAgentChatAdapter.ts`). Dispatched off-tree; SwiftUI doesn't need to
    /// observe this.
    @objc(dispatchMusicAction:)
    func dispatchMusicAction(_ payload: NSDictionary) {
        DispatchQueue.main.async {
            ConversationStore.shared.handleMusicAction(payload)
        }
    }
}
