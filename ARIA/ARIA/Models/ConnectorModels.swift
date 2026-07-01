import Foundation

/// One connected (or connectable) third-party app. Mirrors the web
/// `ConnectionSummary` plus the supported-toolkit catalog.
struct ConnectionSummary: Decodable, Sendable, Identifiable {
    let id: String
    let toolkit: String
    let status: String
    let isDisabled: Bool
    let createdAt: String

    var isActive: Bool { status.uppercased() == "ACTIVE" && !isDisabled }
}

struct ConnectionsResponse: Decodable, Sendable {
    let connections: [ConnectionSummary]
}

struct InitiateConnectionResponse: Decodable, Sendable {
    let id: String
    let redirectUrl: String?
}

struct InitiateConnectionRequest: Encodable, Sendable {
    let toolkit: String
}

struct BillingPortalResponse: Decodable, Sendable {
    let url: String
}

/// Connectable apps — mirrors web `SUPPORTED_TOOLKITS`.
struct SupportedToolkit: Identifiable, Sendable {
    let slug: String
    let label: String
    let symbol: String
    var id: String { slug }

    static let all: [SupportedToolkit] = [
        .init(slug: "notion", label: "Notion", symbol: "doc.text"),
        .init(slug: "gmail", label: "Gmail", symbol: "envelope"),
        .init(slug: "googledocs", label: "Google Docs", symbol: "doc.richtext"),
        .init(slug: "googlesheets", label: "Google Sheets", symbol: "tablecells"),
        .init(slug: "googledrive", label: "Google Drive", symbol: "externaldrive"),
        .init(slug: "googlecalendar", label: "Google Calendar", symbol: "calendar"),
        .init(slug: "slack", label: "Slack", symbol: "number"),
        .init(slug: "clickup", label: "ClickUp", symbol: "checklist"),
        .init(slug: "outlook", label: "Outlook", symbol: "envelope.badge"),
    ]

    static func label(for slug: String) -> String {
        all.first { $0.slug == slug }?.label ?? slug.capitalized
    }
}

extension PlanTier {
    var displayName: String {
        switch self {
        case .free: return "Free"
        case .plus: return "Plus"
        case .pro: return "Pro"
        case .max: return "Max"
        }
    }
}
