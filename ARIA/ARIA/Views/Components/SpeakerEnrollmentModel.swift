import Foundation
import SwiftUI

/// Drives the on-device enrollment flow: countdown → record → process → save.
/// Mirrors the timing and validation of the web `SpeakerProfilesManager`.
@MainActor
final class SpeakerEnrollmentModel: ObservableObject {
    enum Phase {
        case idle, countdown, recording, processing, success, error
    }

    @Published var name = ""
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var countdown = SpeakerEnrollmentModel.countdownSeconds
    @Published private(set) var secondsLeft = SpeakerEnrollmentModel.enrollSeconds
    @Published private(set) var level: Float = 0
    @Published private(set) var waveform = [Float](
        repeating: 0, count: SpeakerEnrollmentModel.waveformBars
    )
    @Published private(set) var errorMessage: String?
    @Published private(set) var savedName: String?
    @Published private(set) var didSucceed = false

    private static let enrollSeconds = 15
    private static let countdownSeconds = 3
    private static let waveformBars = 24
    private static let minPeakRMS: Float = 0.012
    private static let processingTimeoutNs: UInt64 = 25_000_000_000

    private var client: SpeechmaticsLiveClient?
    private var mic: MicPCMStreamer?
    private var flowTask: Task<Void, Never>?
    private var processingTimeout: Task<Void, Never>?
    private var recordingActive = false
    private var peakRMS: Float = 0
    private var completed = false

    var isEnrolling: Bool {
        phase == .countdown || phase == .recording || phase == .processing
    }

    var showsForm: Bool {
        phase == .idle || phase == .error || phase == .success
    }

    var orbScale: CGFloat {
        switch phase {
        case .recording: return 1 + min(0.35, CGFloat(level) * 1.8)
        case .success: return 1.04
        default: return 1
        }
    }

    var orbColor: Color {
        switch phase {
        case .success: return Color(hue: 0.41, saturation: 0.7, brightness: 0.7)
        case .error: return Color(hue: 0.0, saturation: 0.7, brightness: 0.8)
        case .processing: return Color(hue: 0.62, saturation: 0.7, brightness: 0.8)
        case .recording: return Color(hue: 0.45, saturation: 0.7, brightness: 0.7)
        case .countdown: return Color(hue: 0.11, saturation: 0.8, brightness: 0.9)
        case .idle: return AriaTheme.foregroundSubtle
        }
    }

    var statusColor: Color {
        switch phase {
        case .error: return AriaTheme.danger
        case .success: return AriaTheme.foreground
        default: return AriaTheme.foregroundSecondary
        }
    }

    var statusLine: String {
        switch phase {
        case .countdown: return "Get ready to speak…"
        case .recording: return "Read the passage below aloud"
        case .processing: return "Creating voice profile…"
        case .success: return "\(savedName ?? "Voice") saved — Kivo can recognize this speaker"
        case .error: return errorMessage ?? "Something went wrong"
        case .idle: return "Ready to enroll"
        }
    }

    func start() {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            errorMessage = "Enter a name before enrolling."
            phase = .error
            return
        }
        errorMessage = nil
        savedName = nil
        completed = false
        peakRMS = 0
        recordingActive = false
        waveform = [Float](repeating: 0, count: Self.waveformBars)
        flowTask?.cancel()
        flowTask = Task { await runFlow(name: trimmed) }
    }

    func cancel() {
        flowTask?.cancel()
        flowTask = nil
        teardown()
        if phase != .success {
            phase = .idle
            secondsLeft = Self.enrollSeconds
            countdown = Self.countdownSeconds
        }
    }

    // MARK: - Flow

    private func runFlow(name: String) async {
        let client = SpeechmaticsLiveClient(enrollment: true)
        self.client = client
        client.onOpen = { [weak client] in
            client?.requestSpeakers(final: true)
        }
        client.onError = { [weak self] error in
            self?.fail(error.localizedDescription)
        }
        client.onSpeakersResult = { [weak self] speakers in
            self?.handleSpeakers(speakers, name: name)
        }

        do {
            phase = .countdown
            countdown = Self.countdownSeconds
            try await client.connect()

            let mic = MicPCMStreamer()
            self.mic = mic
            try await mic.start { [weak self] pcm in
                guard let self else { return }
                let rms = MicPCMStreamer.pcmLevel(from: pcm)
                self.level = rms
                self.pushWaveform(rms)
                if self.recordingActive {
                    client.sendPCM(pcm)
                    self.peakRMS = max(self.peakRMS, rms)
                }
            }

            // 3-2-1 countdown.
            for tick in stride(from: Self.countdownSeconds, through: 1, by: -1) {
                countdown = tick
                try await Task.sleep(nanoseconds: 800_000_000)
                if Task.isCancelled { return }
            }

            // 15s recording window.
            phase = .recording
            recordingActive = true
            secondsLeft = Self.enrollSeconds
            for tick in stride(from: Self.enrollSeconds, through: 1, by: -1) {
                secondsLeft = tick
                try await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
            }

            recordingActive = false
            mic.stop()
            self.mic = nil

            guard peakRMS >= Self.minPeakRMS else {
                fail("We didn't hear enough. Try again in a quiet room, speaking clearly for the full recording.")
                return
            }

            phase = .processing
            client.sendEndOfStream()
            startProcessingTimeout()
        } catch is CancellationError {
            // handled by cancel()
        } catch {
            fail(error.localizedDescription)
        }
    }

    private func handleSpeakers(_ speakers: [SpeechmaticsSpeakerResult], name: String) {
        guard !completed else { return }
        processingTimeout?.cancel()
        guard speakers.count == 1, let first = speakers.first, !first.speakerIdentifiers.isEmpty else {
            fail("We couldn't detect a single clear voice. Try again in a quiet room, speaking naturally.")
            return
        }
        completed = true
        Task {
            do {
                _ = try await APIClient.shared.saveSpeakerProfile(
                    SaveSpeakerProfileRequest(name: name, speakerIdentifiers: first.speakerIdentifiers)
                )
                savedName = name
                phase = .success
                Haptics.answerReady()
                teardown()
                didSucceed = true
            } catch {
                fail(error.localizedDescription)
            }
        }
    }

    private func startProcessingTimeout() {
        processingTimeout?.cancel()
        processingTimeout = Task { [weak self] in
            try? await Task.sleep(nanoseconds: Self.processingTimeoutNs)
            guard let self, !Task.isCancelled, !self.completed else { return }
            self.fail("Creating your voice profile timed out. Try again in a quiet room.")
        }
    }

    private func pushWaveform(_ rms: Float) {
        var next = waveform
        next.removeFirst()
        next.append(rms)
        waveform = next
    }

    private func fail(_ message: String) {
        errorMessage = message
        phase = .error
        Haptics.error()
        teardown()
    }

    private func teardown() {
        processingTimeout?.cancel()
        processingTimeout = nil
        recordingActive = false
        mic?.stop()
        mic = nil
        client?.close()
        client = nil
        level = 0
    }
}
