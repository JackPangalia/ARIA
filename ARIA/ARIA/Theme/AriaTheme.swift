import SwiftUI
import UIKit

/// Matches web `globals.css` `--app-*` tokens. Chrome colors are dynamic: they
/// resolve to a light or dark value based on the active trait collection, so a
/// single `.preferredColorScheme` at the root flips the whole UI.
enum AriaTheme {
    static let background = Color.appDynamic(light: 0xFFFFFF, dark: 0x000000)
    static let foreground = Color.appDynamic(light: 0x18181B, dark: 0xF4F4F5)
    static let foregroundSecondary = Color.appDynamic(light: 0x3F3F46, dark: 0xD4D4D8)
    static let foregroundMuted = Color.appDynamic(light: 0x71717A, dark: 0xA1A1AA)
    static let foregroundSubtle = Color.appDynamic(light: 0xA1A1AA, dark: 0x71717A)
    static let surface = Color.appDynamic(light: 0xF4F4F5, dark: 0x18181B)
    static let surfaceHover = Color.appDynamic(light: 0xE4E4E7, dark: 0x27272A)
    static let borderStrong = Color.appDynamic(light: 0xD4D4D8, dark: 0x3F3F46)
    static let accent = Color.appDynamic(light: 0x18181B, dark: 0xF4F4F5)
    static let accentForeground = Color.appDynamic(light: 0xFAFAFA, dark: 0x09090B)
    static let danger = Color.appDynamic(light: 0xDC2626, dark: 0xFECACA)
    static let dangerBackground = Color.appDynamic(light: 0xFEE2E2, dark: 0x450A0A)
    static let overlay = Color.black.opacity(0.7)

    static let contentMaxWidth: CGFloat = 304 // 19rem
    static let orbSize: CGFloat = 288 // h-72 w-72 layout box (web h-72)
    static let orbCanvasScale: CGFloat = 1.4 // web OrbParticles 140% canvas for loud-state headroom
    static let orbCameraDistance: Float = 6.7 // web Three.js camera.position.z
    static let orbProjectionScale: CGFloat = 0.195 // layout-relative; pairs with canvas headroom
    static let orbScalePhone: CGFloat = 0.80 // web max-sm:scale-[0.82]
    static let orbVerticalPull: CGFloat = -20 // web max-sm:-my-5

    // Orb mode accents (OrbVisualizer.tsx)
    static let orbIdle = Color(hex: 0x52525B)
    static let orbListen = Color(hex: 0x34D399)
    static let orbFollowUp = Color(hex: 0xFBBF24)
    static let orbThink = Color(hex: 0x8B5CF6)
    static let orbSpeak = Color(hex: 0xEC4899)

    static let horizontalPadding: CGFloat = 20
}

enum OrbMode {
    case idle, listen, followUp, wake, think, speak

    static func from(status: AriaStatus) -> OrbMode {
        switch status {
        case .idle, .error: return .idle
        case .speaking: return .speak
        case .thinking: return .think
        case .capturingQuestion, .wakeDetected: return .wake
        case .followUpListening: return .followUp
        case .listening: return .listen
        }
    }

    var accent: Color {
        switch self {
        case .idle: return AriaTheme.orbIdle
        case .listen: return AriaTheme.orbListen
        case .followUp, .wake: return AriaTheme.orbFollowUp
        case .think: return AriaTheme.orbThink
        case .speak: return AriaTheme.orbSpeak
        }
    }

    var statusLabel: String {
        switch self {
        case .idle: return "Tap start"
        case .listen: return "Listening"
        case .wake: return "Yes?"
        case .followUp: return "Anything else?"
        case .think: return "Thinking"
        case .speak: return "Speaking"
        }
    }

    static func statusLabel(for status: AriaStatus) -> String {
        switch status {
        case .idle: return "Tap start"
        case .listening: return "Listening"
        case .wakeDetected: return "Yes?"
        case .capturingQuestion: return "Hearing you out"
        case .thinking: return "Thinking"
        case .speaking: return "Speaking"
        case .followUpListening: return "Anything else?"
        case .error: return "Something went wrong"
        }
    }
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }

    /// A color that resolves to `light` or `dark` based on the active interface
    /// style — lets `AriaTheme` tokens flip with the chosen appearance.
    static func appDynamic(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            UIColor(appHex: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }
}

extension UIColor {
    convenience init(appHex hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}
