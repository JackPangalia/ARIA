import Foundation

enum AppConfig {
    /// Backend base URL for API routes. Override in `Config.plist` for production.
    static var apiBaseURL: URL {
        if let urlString = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String,
           let url = URL(string: urlString), !urlString.isEmpty {
            return url
        }
        #if DEBUG
        return URL(string: "http://localhost:3000")!
        #else
        return URL(string: "https://aria-psi-steel.vercel.app")!
        #endif
    }

    static let heartbeatIntervalSeconds: TimeInterval = 45
    static let playbackSTTCooldownMs: UInt64 = 800
    static let turnIdleFlushMs: UInt64 = 1_800
    static let contextPrefetchDebounceMs: UInt64 = 400

    /// Requires a paid Apple Developer Program team. Enable when `com.apple.developer.applesignin` is in entitlements.
    static let signInWithAppleEnabled = false
}
