import Combine
import Foundation

@MainActor
final class AriaEngine: ObservableObject {
    @Published private(set) var status: AriaStatus = .idle
    @Published private(set) var utterances: [TranscriptUtterance] = []
    @Published private(set) var micLevel: Float = 0
    @Published var errorMessage: String?

    var onSessionActivity: (() -> Void)?
    var onUsageExhausted: (() -> Void)?

    private let sessionId: String
    private var mic: MicPCMStreamer?
    private var stt: SpeechmaticsLiveClient?
    private var segmentedPlayer: SegmentedAudioPlayer?
    private let captureMachine = QuestionCaptureMachine()
    private let cues = CueEngine()

    private var isAssistantSpeaking = false
    private var suppressSTTUntil: Date = .distantPast
    private var heartbeatTask: Task<Void, Never>?
    private var turnAssemblerText: [String: (text: String, speaker: Int?, speakerName: String?, ids: [String])] = [:]
    private var turnFlushTask: Task<Void, Never>?
    private var prefetchTask: Task<Void, Never>?
    private var askTask: Task<Void, Never>?

    init(sessionId: String) {
        self.sessionId = sessionId
        configureCaptureMachine()
    }

    private func configureCaptureMachine() {
        captureMachine.onStatusChange = { [weak self] captureStatus in
            guard let self else { return }
            switch captureStatus {
            case .listening:
                self.status = .listening
            case .capturingQuestion:
                self.status = .capturingQuestion
                self.cues.playWake()
            case .followUpListening:
                self.status = .followUpListening
                self.cues.playFollowUp()
            }
        }

        captureMachine.onResolveQuestion = { [weak self] captured in
            guard let self else { return }
            self.askTask?.cancel()
            self.askTask = Task {
                await self.askAndReset(captured)
            }
        }
    }

    func start() async {
        errorMessage = nil
        status = .listening

        do {
            let profiles = try await APIClient.shared.listSpeakerProfiles()
            let client = SpeechmaticsLiveClient(profiles: profiles)
            client.onUtterance = { [weak self] utterance in
                self?.handleUtterance(utterance)
            }
            client.onUtteranceEnd = { [weak self] in
                self?.handleUtteranceEnd()
            }
            client.onError = { [weak self] error in
                self?.errorMessage = error.localizedDescription
                self?.status = .error
            }
            stt = client
            try await client.connect()

            let micStreamer = MicPCMStreamer()
            mic = micStreamer
            try await micStreamer.start { [weak self] pcm in
                guard let self else { return }
                self.micLevel = MicPCMStreamer.pcmLevel(from: pcm)
                if self.shouldSendMicToSTT() {
                    self.stt?.sendPCM(pcm)
                }
            }

            startHeartbeat()
        } catch {
            errorMessage = error.localizedDescription
            status = .error
            cues.playError()
            await stop()
        }
    }

    func stop() async {
        stopHeartbeat()
        mic?.stop()
        mic = nil
        stt?.close()
        stt = nil
        captureMachine.dispose()
        cues.stopAll()
        segmentedPlayer?.stop()
        segmentedPlayer = nil
        askTask?.cancel()
        askTask = nil
        turnFlushTask?.cancel()
        prefetchTask?.cancel()
        micLevel = 0
        status = .idle
        await flushPersistedSpeakerTurn()
    }

    private func shouldSendMicToSTT() -> Bool {
        !isAssistantSpeaking && Date() >= suppressSTTUntil
    }

    private func handleUtterance(_ utterance: TranscriptUtterance) {
        guard shouldSendMicToSTT() else { return }

        upsertUtterance(utterance)
        if utterance.isFinal && utterance.speechFinal {
            bufferSpeakerTurn(utterance)
        }

        let wake = WakeWordDetection.extractQuestionAfterWake(from: utterance.text)
        let utteranceStable = utterance.speechFinal || utterance.isFinal

        if !captureMachine.isCapturingQuestion && utteranceStable {
            if wake.detected {
                handleWakeBargeIn()
            }
        }

        captureMachine.handleUtterance(utterance)
    }

    private func handleUtteranceEnd() {
        Task { await flushPersistedSpeakerTurn() }
        captureMachine.handleUtteranceEnd()
    }

    private func handleWakeBargeIn() {
        if status == .thinking || status == .speaking || status == .capturingQuestion {
            cues.stopThinkingLoop()
            segmentedPlayer?.stop()
            askTask?.cancel()
        }
    }

    private func upsertUtterance(_ utterance: TranscriptUtterance) {
        if let index = utterances.firstIndex(where: { $0.id == utterance.id }) {
            utterances[index] = utterance
        } else {
            utterances.append(utterance)
        }
    }

    private func bufferSpeakerTurn(_ utterance: TranscriptUtterance) {
        let key = "\(utterance.speaker)-\(utterance.providerSpeakerLabel ?? "")"
        var entry = turnAssemblerText[key] ?? (text: "", speaker: utterance.speaker, speakerName: utterance.speakerName, ids: [])
        entry.text = WakeWordDetection.joinText(entry.text, utterance.text)
        entry.speaker = utterance.speaker
        entry.speakerName = utterance.speakerName
        entry.ids.append(utterance.id)
        turnAssemblerText[key] = entry
        scheduleTurnFlush()
    }

    private func scheduleTurnFlush() {
        turnFlushTask?.cancel()
        turnFlushTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: AppConfig.turnIdleFlushMs * 1_000_000)
            guard !Task.isCancelled else { return }
            await self?.flushPersistedSpeakerTurn()
        }
    }

    private func flushPersistedSpeakerTurn() async {
        turnFlushTask?.cancel()
        guard !turnAssemblerText.isEmpty else { return }
        let entries = turnAssemblerText
        turnAssemblerText.removeAll()

        for (_, entry) in entries {
            let text = entry.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { continue }
            do {
                _ = try await APIClient.shared.appendTurn(
                    sessionId,
                    turn: CreateTurnRequest(
                        role: .speaker,
                        text: text,
                        speaker: entry.speaker,
                        speakerName: entry.speakerName,
                        sourceUtteranceIds: entry.ids
                    )
                )
                onSessionActivity?()
            } catch {
                // Best-effort persistence; do not interrupt listening.
            }
        }
    }

    private func askAndReset(_ captured: CapturedQuestion) async {
        await flushPersistedSpeakerTurn()
        captureMachine.reset()

        let question = WakeWordDetection.sanitizeQuestionText(captured.question)
        guard WakeWordDetection.isSubstantiveQuestion(question) else {
            status = .listening
            return
        }

        status = .thinking
        captureMachine.suspend()
        cues.startThinkingLoop()
        scheduleContextPrefetch(question)

        let player = SegmentedAudioPlayer()
        segmentedPlayer = player

        do {
            let stream = try await APIClient.shared.askStreaming(
                AskRequest(
                    sessionId: sessionId,
                    question: question,
                    speaker: captured.speaker,
                    speakerName: captured.speakerName
                )
            )
            // Stay in `.thinking` (with the thinking cue) until the first sentence
            // is actually playing — then flip to `.speaking`.
            try player.start(onFirstSegment: { [weak self] in
                guard let self else { return }
                self.cues.stopThinkingLoop()
                Haptics.answerReady()
                self.isAssistantSpeaking = true
                self.status = .speaking
            })
            for try await chunk in stream {
                if Task.isCancelled { break }
                player.append(chunk)
            }
            if Task.isCancelled {
                player.stop()
                segmentedPlayer = nil
                return
            }
            try await player.finish()
            onSessionActivity?()
        } catch {
            cues.stopThinkingLoop()
            player.stop()
            segmentedPlayer = nil
            if Task.isCancelled { return }
            errorMessage = error.localizedDescription
            status = .error
            cues.playError()
        }

        segmentedPlayer = nil
        isAssistantSpeaking = false
        suppressSTTUntil = Date().addingTimeInterval(Double(AppConfig.playbackSTTCooldownMs) / 1000)
        captureMachine.resume()
        status = .listening
        captureMachine.startFollowUpWindow()
    }

    private func scheduleContextPrefetch(_ question: String) {
        prefetchTask?.cancel()
        prefetchTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: AppConfig.contextPrefetchDebounceMs * 1_000_000)
            guard !Task.isCancelled, let self else { return }
            try? await APIClient.shared.prefetchContext(self.sessionId, question: question)
        }
    }

    private func startHeartbeat() {
        stopHeartbeat()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.sendListeningHeartbeat()
                try? await Task.sleep(nanoseconds: UInt64(AppConfig.heartbeatIntervalSeconds * 1_000_000_000))
            }
        }
    }

    private func stopHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = nil
    }

    private func sendListeningHeartbeat() async {
        do {
            let result = try await APIClient.shared.sendHeartbeat(sessionId: sessionId)
            if result.stop {
                await stop()
                errorMessage = "You've used all your listening time this month. Upgrade to keep listening."
                onUsageExhausted?()
            }
        } catch {
            // Best-effort heartbeat.
        }
    }
}
