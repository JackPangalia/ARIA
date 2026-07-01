import SwiftUI

enum AppearancePreference: String, CaseIterable, Identifiable {
    case system, light, dark

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: return "System"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }

    var symbol: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .light: return "sun.max"
        case .dark: return "moon"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

/// App-wide appearance selection, persisted across launches. Injected at the
/// root so every screen (including the 5 `.preferredColorScheme` sites) follows it.
@MainActor
final class ThemeStore: ObservableObject {
    private static let key = "kivo.appearance"

    @Published var preference: AppearancePreference {
        didSet {
            UserDefaults.standard.set(preference.rawValue, forKey: Self.key)
        }
    }

    init() {
        let stored = UserDefaults.standard.string(forKey: Self.key)
        preference = stored.flatMap(AppearancePreference.init(rawValue:)) ?? .system
    }

    var colorScheme: ColorScheme? { preference.colorScheme }
}
