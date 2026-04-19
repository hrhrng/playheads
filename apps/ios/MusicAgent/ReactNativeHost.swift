import Foundation
import UIKit

/// Delegate that tells RN where to find the JS bundle.
/// Debug: Metro on localhost. Release: bundled `main.jsbundle` in the app bundle.
final class PlayheadsRNDelegate: RCTDefaultReactNativeFactoryDelegate {

    override init() {
        super.init()
        self.dependencyProvider = RCTAppDependencyProvider()
    }

    override func sourceURL(for _: RCTBridge) -> URL? {
        bundleURL()
    }

    override func bundleURL() -> URL? {
        #if DEBUG
        return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
        #else
        return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
        #endif
    }
}

/// Singleton host for the React Native surface. Holds a single
/// `RCTReactNativeFactory` so the JS runtime is created once and reused
/// across sheet open/close cycles.
final class ReactNativeHost {
    static let shared = ReactNativeHost()

    private let delegate = PlayheadsRNDelegate()
    let factory: RCTReactNativeFactory
    private var warmedView: UIView?

    private init() {
        factory = RCTReactNativeFactory(delegate: delegate)
    }

    /// Kick off JS runtime + bundle load ahead of first visible use. The first
    /// `view(withModuleName:)` call is what actually boots Hermes and fetches
    /// the Metro bundle; doing it at app launch hides the 200–400ms cost under
    /// the initial mood-feed render instead of stalling the first sheet open.
    func preload() {
        guard warmedView == nil else { return }
        // Building the view is the cheapest way to force JS init. We keep a
        // ref so ARC doesn't tear the surface down; `makeRootView` mints a
        // fresh view for the actual chat and this one stays detached.
        warmedView = factory.rootViewFactory.view(
            withModuleName: "MobileChat",
            initialProperties: ["messages": [] as [Any]]
        )
    }

    /// Builds a fresh RN surface view for the given module.
    /// Each caller gets its own view (they share the underlying runtime).
    func makeRootView(moduleName: String, initialProperties: [String: Any] = [:]) -> UIView {
        factory.rootViewFactory.view(
            withModuleName: moduleName,
            initialProperties: initialProperties
        )
    }
}
