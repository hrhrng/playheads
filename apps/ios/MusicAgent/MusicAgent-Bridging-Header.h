// Swift ↔ ObjC bridging header for MusicAgent.
// Exposes React Native headers to Swift so we can subclass
// RCTDefaultReactNativeFactoryDelegate and call RCTReactNativeFactory.

#import <React/RCTBridgeDelegate.h>
#import <React/RCTBundleURLProvider.h>
#import <React-RCTAppDelegate/RCTReactNativeFactory.h>
#import <React-RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>
#import <React-RCTAppDelegate/RCTRootViewFactory.h>
#import <React-RCTAppDelegate/RCTDependencyProvider.h>
// ReactAppDependencyProvider is shipped as a static lib with public headers
// already on HEADER_SEARCH_PATHS via Pods-MusicAgent.debug.xcconfig, but its
// modulemap isn't reachable from Swift's module resolver (it lives under the
// Pod target, not the aggregate target). Use a plain quoted import instead.
#import "RCTAppDependencyProvider.h"
