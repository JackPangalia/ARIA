import Foundation

enum WakeWordDetection: Sendable {
    nonisolated static let questionSettleMs: UInt64 = 2_800
    nonisolated static let speechFinalSettleMs: UInt64 = 2_800
    // Short grace applied once Speechmatics reports end-of-turn (EndOfUtterance),
    // replacing the long settle wait once we know the speaker has gone silent.
    nonisolated static let endOfUtteranceGraceMs: UInt64 = 500
    nonisolated static let followUpWindowMs: UInt64 = 8_000

    private static let kivoWakeToken =
        "(?:kivo|keevo|keyvo|quivo|kevo|kiva|kibo|kiwo|kievo|kvio|kivio|klivo|vivo|evo|ki\\s+vo|kee\\s+vo|key\\s+vo|qui\\s+vo)"

    nonisolated private static let wakePatterns: [NSRegularExpression] = {
        let patterns = [
            "\\b(?:hey|hi|okay|ok)\\s*,?\\s*\(kivoWakeToken)\\b[\\s,.:;!?-]*",
            "^\\s*\(kivoWakeToken)\\b[\\s,.:;!?-]*",
        ]
        return patterns.compactMap { try? NSRegularExpression(pattern: $0, options: [.caseInsensitive]) }
    }()

    nonisolated static func extractQuestionAfterWake(from text: String) -> (detected: Bool, question: String) {
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        for pattern in wakePatterns {
            if let match = pattern.firstMatch(in: text, options: [], range: range),
               let matchRange = Range(match.range, in: text) {
                let questionStart = matchRange.upperBound
                let question = String(text[questionStart...]).trimmingCharacters(in: .whitespacesAndNewlines)
                return (true, question)
            }
        }
        return (false, "")
    }

    nonisolated static func isSubstantiveQuestion(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else { return false }
        return trimmed.range(of: "[a-zA-Z0-9]", options: .regularExpression) != nil
    }

    nonisolated static func sanitizeQuestionText(_ text: String) -> String {
        text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    }

    nonisolated static func joinText(_ left: String, _ right: String) -> String {
        let a = left.trimmingCharacters(in: .whitespacesAndNewlines)
        let b = right.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !a.isEmpty else { return b }
        guard !b.isEmpty else { return a }
        if a.hasSuffix("-") { return a + b }
        if [".", "!", "?", ":", ";", ","].contains(where: { a.hasSuffix($0) }) {
            return a + " " + b
        }
        return a + " " + b
    }
}
