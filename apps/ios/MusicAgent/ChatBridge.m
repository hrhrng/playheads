// ObjC shim that registers `ChatBridge.swift` with React Native's module
// system. Without this file the Swift @objc class is invisible to JS; with it,
// JS can call `NativeModules.ChatBridge.updateMessages(...)`.

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ChatBridge, NSObject)

RCT_EXTERN_METHOD(updateMessages:(NSArray *)messages)
RCT_EXTERN_METHOD(dispatchMusicAction:(NSDictionary *)payload)

@end
