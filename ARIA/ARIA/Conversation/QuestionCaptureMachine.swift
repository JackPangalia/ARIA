import Foundation

struct CapturedQuestion: Sendable {
    let question: String
    let speaker: Int?
    let speakerName: String?
    let providerSpeakerLabel: String?
}

enum CaptureStatus: Sendable {
    case listening
    case capturingQuestion
    case followUpListening
}

@MainActor
final class QuestionCaptureMachine {
    var onResolveQuestion: ((CapturedQuestion) -> Void)?
    var onStatusChange: ((CaptureStatus) -> Void)?

    private let questionSettleMs: UInt64
    private let speechFinalSettleMs: UInt64
    private let endOfUtteranceGraceMs: UInt64
    private let followUpWindowMs: UInt64

    private var suspended = false
    private var capturingQuestion = false
    private var questionUtterances: [TranscriptUtterance] = []
    private var wakeUtteranceId: String?
    private var wakeSpeaker: Int?
    private var wakeSpeakerName: String?
    private var wakeProviderSpeakerLabel: String?
    private var inlineQuestion = ""
    private var captureWholeAnchorUtterance = false
    private var followUpListening = false

    private var questionSettleTask: Task<Void, Never>?
    private var followUpTask: Task<Void, Never>?

    init(
        questionSettleMs: UInt64 = WakeWordDetection.questionSettleMs,
        speechFinalSettleMs: UInt64 = WakeWordDetection.speechFinalSettleMs,
        endOfUtteranceGraceMs: UInt64 = WakeWordDetection.endOfUtteranceGraceMs,
        followUpWindowMs: UInt64 = WakeWordDetection.followUpWindowMs
    ) {
        self.questionSettleMs = questionSettleMs
        self.speechFinalSettleMs = speechFinalSettleMs
        self.endOfUtteranceGraceMs = endOfUtteranceGraceMs
        self.followUpWindowMs = followUpWindowMs
    }

    var isCapturingQuestion: Bool { capturingQuestion }

    func suspend() { suspended = true }
    func resume() { suspended = false }

    func handleUtterance(_ utterance: TranscriptUtterance) {
        guard !suspended else { return }

        let wake = WakeWordDetection.extractQuestionAfterWake(from: utterance.text)
        let utteranceStable = utterance.speechFinal || utterance.isFinal

        if !capturingQuestion && utteranceStable {
            if wake.detected {
                handleWake(utterance, isFollowUp: false)
            } else if followUpListening && !utterance.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                handleWake(utterance, isFollowUp: true)
            }
        }

        guard capturingQuestion else { return }

        if wakeUtteranceId == utterance.id {
            if wake.detected {
                inlineQuestion = wake.question
            } else if captureWholeAnchorUtterance {
                inlineQuestion = utterance.text.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            if !inlineQuestion.isEmpty {
                scheduleQuestionResolution(
                    utterance.speechFinal ? speechFinalSettleMs : questionSettleMs
                )
            }
            return
        }

        upsertQuestionUtterance(
            TranscriptUtterance(
                id: utterance.id,
                speaker: utterance.speaker,
                speakerName: utterance.speakerName,
                providerSpeakerLabel: utterance.providerSpeakerLabel,
                text: wake.detected ? wake.question : utterance.text,
                start: utterance.start,
                end: utterance.end,
                isFinal: utterance.isFinal,
                speechFinal: utterance.speechFinal
            )
        )

        if !getCapturedQuestion().question.isEmpty {
            scheduleQuestionResolution(
                utterance.speechFinal ? speechFinalSettleMs : questionSettleMs
            )
        }
    }

    func handleUtteranceEnd() {
        guard capturingQuestion else { return }
        if !getCapturedQuestion().question.isEmpty {
            // Speechmatics reported end-of-turn: collapse any pending long settle
            // timer to a short grace so we dispatch the question promptly.
            scheduleQuestionResolution(endOfUtteranceGraceMs)
            return
        }
        wakeUtteranceId = nil
        wakeSpeaker = nil
        onStatusChange?(.capturingQuestion)
    }

    func startFollowUpWindow() {
        stopFollowUpWindow()
        followUpListening = true
        onStatusChange?(.followUpListening)
        followUpTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: (self?.followUpWindowMs ?? 8_000) * 1_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                self?.followUpListening = false
                self?.onStatusChange?(.listening)
            }
        }
    }

    func stopFollowUpWindow() {
        followUpListening = false
        followUpTask?.cancel()
        followUpTask = nil
    }

    func reset() {
        clearQuestionSettleTimer()
        capturingQuestion = false
        questionUtterances = []
        wakeUtteranceId = nil
        wakeSpeaker = nil
        wakeSpeakerName = nil
        wakeProviderSpeakerLabel = nil
        inlineQuestion = ""
        captureWholeAnchorUtterance = false
    }

    func dispose() {
        reset()
        stopFollowUpWindow()
    }

    private func handleWake(_ utterance: TranscriptUtterance, isFollowUp: Bool) {
        stopFollowUpWindow()
        clearQuestionSettleTimer()
        questionUtterances = []
        inlineQuestion = ""
        wakeUtteranceId = utterance.id
        wakeSpeaker = utterance.speaker
        wakeSpeakerName = utterance.speakerName
        wakeProviderSpeakerLabel = utterance.providerSpeakerLabel
        captureWholeAnchorUtterance = isFollowUp
        capturingQuestion = true
        onStatusChange?(.capturingQuestion)
    }

    private func upsertQuestionUtterance(_ utterance: TranscriptUtterance) {
        let text = utterance.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        if let index = questionUtterances.firstIndex(where: { $0.id == utterance.id }) {
            questionUtterances[index] = utterance
        } else {
            questionUtterances.append(utterance)
        }
    }

    private func getCapturedQuestion() -> CapturedQuestion {
        let parts = ([inlineQuestion] + questionUtterances.map(\.text))
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        var merged = ""
        for part in parts {
            merged = WakeWordDetection.joinText(merged, part)
        }

        return CapturedQuestion(
            question: WakeWordDetection.sanitizeQuestionText(merged),
            speaker: wakeSpeaker ?? questionUtterances.first?.speaker,
            speakerName: wakeSpeakerName ?? questionUtterances.first?.speakerName,
            providerSpeakerLabel: wakeProviderSpeakerLabel ?? questionUtterances.first?.providerSpeakerLabel
        )
    }

    private func scheduleQuestionResolution(_ delayMs: UInt64) {
        clearQuestionSettleTimer()
        questionSettleTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: delayMs * 1_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard let self else { return }
                let captured = self.getCapturedQuestion()
                guard WakeWordDetection.isSubstantiveQuestion(captured.question) else { return }
                self.onResolveQuestion?(captured)
            }
        }
    }

    private func clearQuestionSettleTimer() {
        questionSettleTask?.cancel()
        questionSettleTask = nil
    }
}
