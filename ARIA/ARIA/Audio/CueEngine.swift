import AVFoundation

/// Procedural audio cues for Kivo's state machine — an iOS port of the web
/// `cue-engine.ts`. Tones are synthesized into in-memory WAV buffers (no asset
/// files), played through the active play-and-record session, and paired with
/// haptics so every state change is felt as well as heard. Cues are short, quiet,
/// and musical so they don't compete with the conversation in the room.
@MainActor
final class CueEngine: NSObject {
    var enabled = true

    private let sampleRate: Double = 44_100
    private var players: [AVAudioPlayer] = []
    private var pulseTimer: Timer?

    private struct Note {
        let freq: Double
        let durationMs: Double
        let gain: Double
        let startOffsetMs: Double
    }

    // Frequencies / gains / timing mirror the web cue engine exactly.
    private lazy var wakeData = makeWav([
        Note(freq: 659.25, durationMs: 80, gain: 0.18, startOffsetMs: 0),   // E5
        Note(freq: 880.0, durationMs: 110, gain: 0.18, startOffsetMs: 70),  // A5
    ])
    private lazy var followUpData = makeWav([
        Note(freq: 659.25, durationMs: 110, gain: 0.08, startOffsetMs: 0),  // soft E5
    ])
    private lazy var errorData = makeWav([
        Note(freq: 440.0, durationMs: 130, gain: 0.15, startOffsetMs: 0),   // A4
        Note(freq: 293.66, durationMs: 150, gain: 0.15, startOffsetMs: 120), // D4
    ])
    private lazy var pulseData = makeWav([
        Note(freq: 220.0, durationMs: 180, gain: 0.45, startOffsetMs: 0),   // low A3
    ])

    // MARK: - Cues (each paired with a matching haptic)

    /// Bright ascending two-note when the wake word fires.
    func playWake() {
        Haptics.wake()
        play(wakeData)
    }

    /// Single soft tone when the follow-up window opens.
    func playFollowUp() {
        Haptics.followUp()
        play(followUpData)
    }

    /// Descending two-note on error.
    func playError() {
        Haptics.error()
        play(errorData)
    }

    /// Low quiet pulse repeated while Kivo is thinking.
    func startThinkingLoop() {
        guard enabled else { return }
        stopThinkingLoop()
        playPulse()
        let timer = Timer(timeInterval: 1.2, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.playPulse() }
        }
        RunLoop.main.add(timer, forMode: .common)
        pulseTimer = timer
    }

    func stopThinkingLoop() {
        pulseTimer?.invalidate()
        pulseTimer = nil
    }

    func stopAll() {
        stopThinkingLoop()
        players.forEach { $0.stop() }
        players.removeAll()
    }

    private func playPulse() {
        Haptics.thinkingPulse()
        play(pulseData)
    }

    // MARK: - Playback

    private func play(_ data: Data?) {
        guard enabled, let data else { return }
        do {
            let player = try AVAudioPlayer(data: data)
            player.delegate = self
            player.prepareToPlay()
            player.play()
            players.append(player)
        } catch {
            // Cues are non-critical; never surface failures.
        }
    }

    // MARK: - Tone synthesis

    private func makeWav(_ notes: [Note]) -> Data? {
        let totalMs = notes.map { $0.startOffsetMs + $0.durationMs }.max() ?? 0
        guard totalMs > 0 else { return nil }
        let totalSamples = Int((totalMs / 1000.0) * sampleRate) + 64
        var samples = [Float](repeating: 0, count: totalSamples)

        for note in notes {
            let start = Int((note.startOffsetMs / 1000.0) * sampleRate)
            let dur = note.durationMs / 1000.0
            let count = Int(dur * sampleRate)
            let attack = 0.008
            let release = min(0.05, dur * 0.4)

            for i in 0..<count {
                let idx = start + i
                guard idx < totalSamples else { break }
                let t = Double(i) / sampleRate
                // Short attack + exponential-ish release to avoid clicks.
                let env: Double
                if t < attack {
                    env = t / attack
                } else if t > dur - release {
                    let r = (dur - t) / release
                    env = max(0, r * r)
                } else {
                    env = 1
                }
                samples[idx] += Float(sin(2 * Double.pi * note.freq * t) * note.gain * env)
            }
        }

        return Self.wavData(from: samples, sampleRate: Int(sampleRate))
    }

    private static func wavData(from samples: [Float], sampleRate: Int) -> Data {
        var pcm = [Int16]()
        pcm.reserveCapacity(samples.count)
        for s in samples {
            let clamped = max(-1, min(1, s))
            pcm.append(Int16(clamped * 32_767))
        }

        let dataSize = pcm.count * 2
        let byteRate = sampleRate * 2
        var data = Data()

        func appendString(_ s: String) { data.append(contentsOf: s.utf8) }
        func appendUInt32(_ v: UInt32) { var le = v.littleEndian; data.append(Data(bytes: &le, count: 4)) }
        func appendUInt16(_ v: UInt16) { var le = v.littleEndian; data.append(Data(bytes: &le, count: 2)) }

        appendString("RIFF")
        appendUInt32(UInt32(36 + dataSize))
        appendString("WAVE")
        appendString("fmt ")
        appendUInt32(16)                  // PCM fmt chunk size
        appendUInt16(1)                   // PCM
        appendUInt16(1)                   // mono
        appendUInt32(UInt32(sampleRate))
        appendUInt32(UInt32(byteRate))
        appendUInt16(2)                   // block align
        appendUInt16(16)                  // bits per sample
        appendString("data")
        appendUInt32(UInt32(dataSize))
        pcm.withUnsafeBytes { data.append(contentsOf: $0) }
        return data
    }
}

extension CueEngine: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor [weak self] in
            self?.players.removeAll { $0 === player }
        }
    }
}
