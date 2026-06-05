import Combine
import Foundation

@MainActor
final class ConsentStore: ObservableObject {
    static let shared = ConsentStore()

    private enum Keys {
        static let aiDataSharing = "aria.consent.aiDataSharing"
        static let consentVersion = "aria.consent.version"
    }

    static let currentConsentVersion = 1

    @Published private(set) var hasAcceptedAIDataSharing: Bool

    var needsConsent: Bool {
        !hasAcceptedAIDataSharing || storedConsentVersion != Self.currentConsentVersion
    }

    private var storedConsentVersion: Int {
        UserDefaults.standard.integer(forKey: Keys.consentVersion)
    }

    private init() {
        hasAcceptedAIDataSharing = UserDefaults.standard.bool(forKey: Keys.aiDataSharing)
    }

    func acceptAIDataSharing() {
        UserDefaults.standard.set(true, forKey: Keys.aiDataSharing)
        UserDefaults.standard.set(Self.currentConsentVersion, forKey: Keys.consentVersion)
        hasAcceptedAIDataSharing = true
    }

    func revokeConsent() {
        UserDefaults.standard.set(false, forKey: Keys.aiDataSharing)
        UserDefaults.standard.removeObject(forKey: Keys.consentVersion)
        hasAcceptedAIDataSharing = false
    }
}
