import Foundation

struct SpeechmaticsSpeakerResult: Sendable {
    let label: String
    let speakerIdentifiers: [String]
}

@MainActor
final class SpeechmaticsLiveClient: NSObject {
    var onUtterance: ((TranscriptUtterance) -> Void)?
    var onUtteranceEnd: (() -> Void)?
    var onSpeakersResult: (([SpeechmaticsSpeakerResult]) -> Void)?
    var onError: ((Error) -> Void)?
    var onOpen: (() -> Void)?
    var onClose: (() -> Void)?

    private var webSocket: URLSessionWebSocketTask?
    private var session: URLSession?
    private var seqNo = 0
    private var recognitionStarted = false
    private var audioQueue: [Data] = []
    private var speakerLabelToIndex: [String: Int] = [:]
    private var speakerLabelToName: [String: String] = [:]
    private var closedByClient = false
    private var reconnectTask: Task<Void, Never>?
    private let profiles: [SpeakerProfileDoc]
    private let enrollment: Bool
    private var loggedStartConfig = false

    init(profiles: [SpeakerProfileDoc] = [], enrollment: Bool = false) {
        self.profiles = profiles
        self.enrollment = enrollment
        super.init()
        for profile in profiles {
            speakerLabelToName[Self.safeSpeakerLabel(profile.name)] = profile.name
        }
    }

    func connect() async throws {
        closedByClient = false
        let tokenResponse = try await APIClient.shared.getSpeechmaticsToken()
        let urlString = "wss://\(tokenResponse.region).rt.speechmatics.com/v2?jwt=\(tokenResponse.token.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? tokenResponse.token)"
        guard let url = URL(string: urlString) else {
            throw SpeechmaticsClientError.invalidURL
        }

        let session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
        self.session = session
        let task = session.webSocketTask(with: url)
        self.webSocket = task
        task.resume()
        receiveLoop()
        sendJSON(buildStartRecognitionMessage())
    }

    func sendPCM(_ data: Data) {
        guard recognitionStarted else {
            audioQueue.append(data)
            return
        }
        seqNo += 1
        let errorHandler = onError
        webSocket?.send(.data(data)) { error in
            if let error {
                Task { @MainActor in
                    errorHandler?(error)
                }
            }
        }
    }

    func requestSpeakers(final: Bool = false) {
        sendJSON(["message": "GetSpeakers", "final": final])
    }

    /// Ends recognition; required before final speaker identifiers are returned.
    func sendEndOfStream() {
        guard recognitionStarted else { return }
        recognitionStarted = false
        sendJSON(["message": "EndOfStream", "last_seq_no": seqNo])
    }

    func close() {
        closedByClient = true
        reconnectTask?.cancel()
        reconnectTask = nil
        if recognitionStarted {
            sendJSON(["message": "EndOfStream", "last_seq_no": seqNo])
        }
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        session?.invalidateAndCancel()
        session = nil
        recognitionStarted = false
        audioQueue.removeAll()
        onClose?()
    }

    private func receiveLoop() {
        webSocket?.receive { [weak self] result in
            Task { @MainActor [weak self] in
                guard let self else { return }
                switch result {
                case .failure(let error):
                    self.onError?(error)
                case .success(let message):
                    switch message {
                    case .string(let text):
                        self.handleMessage(text)
                    case .data(let data):
                        if let text = String(data: data, encoding: .utf8) {
                            self.handleMessage(text)
                        }
                    @unknown default:
                        break
                    }
                    self.receiveLoop()
                }
            }
        }
    }

    private func handleMessage(_ text: String) {
        guard
            let data = text.data(using: .utf8),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let message = json["message"] as? String
        else { return }

        switch message {
        case "RecognitionStarted":
            recognitionStarted = true
            onOpen?()
            flushAudioQueue()
        case "AddPartialTranscript", "AddTranscript":
            handleTranscript(json: json, isFinal: message == "AddTranscript")
        case "EndOfUtterance":
            onUtteranceEnd?()
        case "SpeakersResult":
            if let speakers = json["speakers"] as? [[String: Any]] {
                let mapped = speakers.compactMap { speaker -> SpeechmaticsSpeakerResult? in
                    guard let label = speaker["label"] as? String else { return nil }
                    let ids = speaker["speaker_identifiers"] as? [String] ?? []
                    return SpeechmaticsSpeakerResult(label: label, speakerIdentifiers: ids)
                }
                onSpeakersResult?(mapped)
            }
        case "Error":
            let reason = json["reason"] as? String ?? "unknown"
            onError?(SpeechmaticsClientError.server(reason))
        default:
            break
        }
    }

    private func handleTranscript(json: [String: Any], isFinal: Bool) {
        guard
            let metadata = json["metadata"] as? [String: Any],
            let start = metadata["start_time"] as? Double,
            let end = metadata["end_time"] as? Double,
            let results = json["results"] as? [[String: Any]]
        else { return }

        let groups = Self.groupResultsBySpeaker(results)
        let baseId = "\(start)-\(isFinal ? "final" : "partial")"

        for (index, group) in groups.enumerated() {
            let speaker = speakerIndex(for: group.label)
            let speakerName = speakerName(for: group.label)
            if isFinal {
                debugLog(
                    "Speechmatics speaker label mapped. providerSpeakerLabel=\(group.label) speaker=\(speaker) speakerName=\(speakerName ?? "nil") mappedAs=\(speakerName ?? "Other speaker") textPreview=\(String(group.text.prefix(120)))"
                )
            }
            let utterance = TranscriptUtterance(
                id: "\(baseId)-\(index)",
                speaker: speaker,
                speakerName: speakerName,
                providerSpeakerLabel: group.label,
                text: group.text,
                start: start,
                end: end,
                isFinal: isFinal,
                speechFinal: isFinal
            )
            onUtterance?(utterance)
        }
    }

    private func speakerIndex(for label: String) -> Int {
        if let match = label.range(of: #"^S(\d+)$"#, options: [.regularExpression, .caseInsensitive]) {
            let digits = label[match].dropFirst()
            return max(0, (Int(digits) ?? 1) - 1)
        }
        if let existing = speakerLabelToIndex[label] { return existing }
        let next = speakerLabelToIndex.count
        speakerLabelToIndex[label] = next
        return next
    }

    private func speakerName(for label: String) -> String? {
        if let known = speakerLabelToName[label] {
            return known
        }
        if profiles.count == 1, isGenericSpeakerLabel(label) {
            // iPhone mic characteristics can miss a web-enrolled identifier and
            // return a stable generic S1. With one enrolled profile, prefer the
            // user's known identity over showing every line as Other speaker.
            return profiles[0].name
        }
        return safeDisplayName(for: label)
    }

    private func safeDisplayName(for label: String) -> String? {
        if isGenericSpeakerLabel(label) {
            return nil
        }
        let clean = label.trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.isEmpty ? nil : clean
    }

    private func isGenericSpeakerLabel(_ label: String) -> Bool {
        label.range(of: #"^S\d+$"#, options: [.regularExpression, .caseInsensitive]) != nil
    }

    private static func safeSpeakerLabel(_ label: String) -> String {
        let collapsed = label
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        let trimmed = String(collapsed.prefix(100))
        if trimmed.isEmpty { return "Unknown speaker" }
        if trimmed.range(of: #"^S\d+$"#, options: [.regularExpression, .caseInsensitive]) != nil {
            return "Speaker \(trimmed.dropFirst())"
        }
        return trimmed
    }

    private func flushAudioQueue() {
        let pending = audioQueue
        audioQueue.removeAll()
        pending.forEach { sendPCM($0) }
    }

    private func sendJSON(_ object: Any) {
        guard
            let data = try? JSONSerialization.data(withJSONObject: object),
            let text = String(data: data, encoding: .utf8)
        else { return }
        let errorHandler = onError
        webSocket?.send(.string(text)) { error in
            if let error {
                Task { @MainActor in
                    errorHandler?(error)
                }
            }
        }
    }

    private static let defaultMaxSpeakers = 10
    private static let enrolledSpeakerSensitivity = 0.2

    private static func preferCurrentSpeaker(for profileCount: Int) -> Bool {
        return true
    }

    private static func maxSpeakers(for profileCount: Int) -> Int {
        if profileCount == 0 { return defaultMaxSpeakers }
        return min(defaultMaxSpeakers, max(2, profileCount + 1))
    }

    private static func speakerSensitivity(for profileCount: Int) -> Double? {
        if profileCount == 0 { return nil }
        return enrolledSpeakerSensitivity
    }

    private func buildStartRecognitionMessage() -> [String: Any] {
        let profileSummaries = profiles.map { profile in
            "\(Self.safeSpeakerLabel(profile.name)):\(profile.speakerIdentifiers.count)"
        }
        let enrolledIdentifierCount = profiles.reduce(0) { $0 + $1.speakerIdentifiers.count }
        let preferCurrentSpeaker = Self.preferCurrentSpeaker(for: profiles.count)
        let maxSpeakers = enrollment ? 2 : Self.maxSpeakers(for: profiles.count)
        let speakerSensitivity = Self.speakerSensitivity(for: profiles.count)
        var speakerDiarizationConfig: [String: Any] = [
            "max_speakers": maxSpeakers,
            "prefer_current_speaker": preferCurrentSpeaker,
        ]
        if enrollment {
            // Recommended enrollment mode: auto-return speaker identifiers.
            speakerDiarizationConfig["get_speakers"] = true
        } else if !profiles.isEmpty {
            let speakers: [[String: Any]] = profiles.map { profile in
                [
                    "label": Self.safeSpeakerLabel(profile.name),
                    "speaker_identifiers": profile.speakerIdentifiers,
                ]
            }
            speakerDiarizationConfig["speakers"] = speakers
            if let speakerSensitivity {
                speakerDiarizationConfig["speaker_sensitivity"] = speakerSensitivity
            }
        }
        let transcriptionConfig: [String: Any] = [
            "language": "en",
            "operating_point": "enhanced",
            "diarization": "speaker",
            "enable_partials": true,
            "max_delay": 0.7,
            "max_delay_mode": "fixed",
            "additional_vocab": [
                [
                    "content": "Kivo",
                    "sounds_like": ["kivo", "keevo", "keyvo", "quivo", "qui vo", "kee vo"],
                ],
                [
                    "content": "Hey Kivo",
                    "sounds_like": ["hey kivo", "hey keevo", "hey keyvo", "hey quivo"],
                ],
            ],
            "speaker_diarization_config": speakerDiarizationConfig,
            "conversation_config": [
                // Silence gap (s) before EndOfUtterance — must stay LESS than
                // max_delay (0.7 above). Mirrors the web client's tuning.
                "end_of_utterance_silence_trigger": 0.6,
            ],
        ]
        if !loggedStartConfig {
            loggedStartConfig = true
            debugLog(
                "Starting Speechmatics speaker identification. profiles=\(profileSummaries) enrolledIdentifierCount=\(enrolledIdentifierCount) maxSpeakers=\(maxSpeakers) preferCurrentSpeaker=\(preferCurrentSpeaker) speakerSensitivity=\(speakerSensitivity.map { String($0) } ?? "default")"
            )
        }

        return [
            "message": "StartRecognition",
            "audio_format": [
                "type": "raw",
                "encoding": "pcm_s16le",
                "sample_rate": 16_000,
            ],
            "transcription_config": transcriptionConfig,
        ]
    }

    private static func groupResultsBySpeaker(_ results: [[String: Any]]) -> [(label: String, text: String)] {
        var groups: [(label: String, text: String)] = []
        var currentLabel: String?
        var currentText = ""
        var lastSpeaker = "S1"

        for item in results {
            guard
                let alternatives = item["alternatives"] as? [[String: Any]],
                let alt = alternatives.first,
                let content = alt["content"] as? String
            else { continue }

            let speaker = alt["speaker"] as? String ?? lastSpeaker
            lastSpeaker = speaker
            let type = item["type"] as? String ?? "word"

            if currentLabel != speaker {
                if let currentLabel, !currentText.isEmpty {
                    groups.append((currentLabel, currentText.trimmingCharacters(in: .whitespacesAndNewlines)))
                }
                currentLabel = speaker
                currentText = content
            } else {
                currentText = appendToken(currentText, content, type: type)
            }
        }

        if let currentLabel, !currentText.isEmpty {
            groups.append((currentLabel, currentText.trimmingCharacters(in: .whitespacesAndNewlines)))
        }
        return groups
    }

    private static func appendToken(_ current: String, _ token: String, type: String) -> String {
        if current.isEmpty { return token }
        if type == "punctuation" { return current + token }
        return current + " " + token
    }

    private func debugLog(_ message: String) {
        #if DEBUG
        print("[ARIA] speaker │ \(message)")
        #endif
    }
}

extension SpeechmaticsLiveClient: URLSessionWebSocketDelegate {
    nonisolated func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        Task { @MainActor in
            self.recognitionStarted = false
            self.onClose?()
            guard !self.closedByClient else { return }
            let code = closeCode.rawValue
            if [4_005, 4_013, 1_011].contains(code) {
                self.reconnectTask?.cancel()
                self.reconnectTask = Task {
                    try? await Task.sleep(nanoseconds: 5_000_000_000)
                    guard !Task.isCancelled else { return }
                    try? await self.connect()
                }
            }
        }
    }
}

enum SpeechmaticsClientError: LocalizedError {
    case invalidURL
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid Speechmatics URL."
        case .server(let reason): return "Speechmatics error: \(reason)"
        }
    }
}
