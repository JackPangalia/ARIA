import Foundation

/// Product naming: the App Store product is **ARIA**; the spoken wake phrase remains **Hey Kivo**
/// to match the web backend, Speechmatics vocabulary, and answer pipeline.
enum Brand {
    static let appName = "ARIA"
    static let wakePhrase = "Hey Kivo"
    static let tagline = "Your in-person AI assistant"
    static let privacyPolicyURL = URL(string: "https://aria-psi-steel.vercel.app/privacy")!
    static let termsURL = URL(string: "https://aria-psi-steel.vercel.app/terms")!
    static let supportURL = URL(string: "mailto:jackpangalia1@gmail.com")!
}
