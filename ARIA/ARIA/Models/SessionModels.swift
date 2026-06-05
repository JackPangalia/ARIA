import Foundation

enum SessionStatus: String, Codable, Sendable {
    case active, ended, archived, trashed
}

enum TurnRole: String, Codable, Sendable {
    case speaker, userQuestion = "user_question", assistant
}

struct SessionDoc: Identifiable, Codable, Sendable, Hashable {
    let id: String
    var title: String
    var autoTitled: Bool
    var status: SessionStatus
    var speakerCount: Int
    var pinned: Bool
    var createdAt: String
    var updatedAt: String
    var endedAt: String?
    var trashedAt: String?
    var lastSummaryAt: String?
    var tokenEstimate: Int
    var searchableTextPreview: String
    var turnCount: Int
    var mode: String?
    var botId: String?
}

struct TurnDoc: Identifiable, Codable, Sendable, Hashable {
    let id: String
    let role: TurnRole
    let text: String
    let speaker: Int?
    let speakerName: String?
    let sourceUtteranceIds: [String]
    let sequence: Int
    let tokenEstimate: Int
    let summarized: Bool
    let createdAt: String

    var displaySpeakerName: String? {
        speakerName
    }
}

struct SessionSummaryDoc: Codable, Sendable {
    let rollingSummary: String
    let keyDecisions: [String]
    let openQuestions: [String]
    let timeline: [String]
    let lastCoveredTurnId: String?
    let updatedAt: String
}

struct SessionDetailResponse: Codable, Sendable {
    var session: SessionDoc
    let turns: [TurnDoc]
    let summary: SessionSummaryDoc?
    let facts: [SessionFactDoc]
    let pins: [SessionPinDoc]
}

struct SessionFactDoc: Codable, Sendable, Identifiable {
    let id: String
    let text: String
    let category: String
    let pinned: Bool
    let sourceTurnId: String?
    let createdAt: String
    let updatedAt: String
}

struct SessionPinDoc: Codable, Sendable, Identifiable {
    let id: String
    let turnId: String
    let label: String
    let snippet: String
    let createdAt: String
}

struct SpeakerProfileDoc: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let speakerIdentifiers: [String]
    let sampleCount: Int
    let createdAt: String
    let updatedAt: String
}

struct CreateSessionRequest: Encodable, Sendable {
    var title: String?
    var speakerCount: Int = 2
}

struct CreateTurnRequest: Encodable, Sendable {
    let role: TurnRole
    let text: String
    var speaker: Int?
    var speakerName: String?
    var sourceUtteranceIds: [String]?
}

struct AskRequest: Encodable, Sendable {
    let sessionId: String
    let question: String
    var speaker: Int?
    var speakerName: String?
}

struct PrefetchContextRequest: Encodable, Sendable {
    let question: String
}

struct HeartbeatRequest: Encodable, Sendable {
    let sessionId: String
}

struct HeartbeatResponse: Decodable, Sendable {
    let remainingSeconds: Int
    let stop: Bool
}

struct SessionsListResponse: Decodable, Sendable {
    let sessions: [SessionDoc]
}

struct SpeakerProfilesResponse: Decodable, Sendable {
    let profiles: [SpeakerProfileDoc]
}

struct SpeechmaticsTokenResponse: Decodable, Sendable {
    let token: String
    let expiresIn: Int
    let region: String
}

struct APIErrorResponse: Decodable, Sendable {
    let error: String?
    let code: String?
}
