import Foundation

typealias SpeakerId = Int

struct TranscriptUtterance: Identifiable, Equatable, Sendable {
    let id: String
    let speaker: SpeakerId
    var speakerName: String?
    var providerSpeakerLabel: String?
    var text: String
    let start: Double
    let end: Double
    let isFinal: Bool
    var speechFinal: Bool

    var displaySpeakerName: String {
        if let speakerName, !speakerName.isEmpty { return speakerName }
        return "Other speaker"
    }
}

enum AriaStatus: String, Sendable, CaseIterable {
    case idle
    case listening
    case wakeDetected = "wake-detected"
    case capturingQuestion = "capturing-question"
    case thinking
    case speaking
    case followUpListening = "follow-up-listening"
    case error

    var label: String {
        switch self {
        case .idle: return "Ready"
        case .listening: return "Listening"
        case .wakeDetected: return "Wake detected"
        case .capturingQuestion: return "Capturing question"
        case .thinking: return "Thinking"
        case .speaking: return "Speaking"
        case .followUpListening: return "Follow-up window"
        case .error: return "Error"
        }
    }

    var isLive: Bool {
        switch self {
        case .listening, .wakeDetected, .capturingQuestion, .thinking, .speaking, .followUpListening:
            return true
        case .idle, .error:
            return false
        }
    }
}
