import Foundation

enum PlanTier: String, Codable, Sendable {
    case free, plus, pro, max
}

struct UsageSummary: Codable, Sendable {
    let tier: PlanTier
    let periodKey: String
    let listening: ListeningUsage
    let asks: AskUsage

    struct ListeningUsage: Codable, Sendable {
        let usedSeconds: Int
        let capSeconds: Int
        let remainingSeconds: Int
        let pct: Double
        let exhausted: Bool
    }

    struct AskUsage: Codable, Sendable {
        let usedTokens: Int
        let capTokens: Int
        let pct: Double
        let exhausted: Bool
    }
}
