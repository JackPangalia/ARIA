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
        /// Fade-in (ms) — longer = softer, airier onset.
        var attackMs: Double = 8
        /// Fade-out (ms) — longer = gentler, more bell-like tail.
        var releaseMs: Double = 50
        /// Cents of detune — a small amount adds a warm shimmer.
        var detuneCents: Double = 0
        var triangle: Bool = false
    }

    // Frequencies / gains / timing / envelopes mirror the web cue engine exactly.
    private lazy var wakeData = makeWav([
        // Soft ascending major triad (E–G#–B) swelling in, plus a faint octave halo.
        Note(freq: 659.25, durationMs: 520, gain: 0.1, startOffsetMs: 0, attackMs: 45, releaseMs: 380, detuneCents: 4),
        Note(freq: 830.61, durationMs: 520, gain: 0.09, startOffsetMs: 90, attackMs: 55, releaseMs: 400, detuneCents: -4),
        Note(freq: 987.77, durationMs: 560, gain: 0.085, startOffsetMs: 180, attackMs: 70, releaseMs: 460, detuneCents: 5),
        Note(freq: 1318.51, durationMs: 480, gain: 0.028, startOffsetMs: 200, attackMs: 90, releaseMs: 420),
    ])
    private lazy var followUpData = makeWav([
        // Single warm bell — soft fundamental + quiet octave partial.
        Note(freq: 659.25, durationMs: 480, gain: 0.075, startOffsetMs: 0, attackMs: 35, releaseMs: 400),
        Note(freq: 1318.51, durationMs: 360, gain: 0.018, startOffsetMs: 0, attackMs: 50, releaseMs: 300),
    ])
    private lazy var errorData = makeWav([
        // Soft descending minor third (A4 -> F4).
        Note(freq: 440.0, durationMs: 320, gain: 0.1, startOffsetMs: 0, attackMs: 25, releaseMs: 260, triangle: true),
        Note(freq: 349.23, durationMs: 380, gain: 0.1, startOffsetMs: 160, attackMs: 30, releaseMs: 320, triangle: true),
    ])
    private lazy var pulseData = makeWav([
        // Faint, slow low-fifth breath (A2 + E3).
        Note(freq: 110.0, durationMs: 900, gain: 0.05, startOffsetMs: 0, attackMs: 180, releaseMs: 600),
        Note(freq: 164.81, durationMs: 820, gain: 0.03, startOffsetMs: 0, attackMs: 200, releaseMs: 560),
    ])
    private lazy var closeData = makeWav([
        // Gentle descending chime (B–E) with a soft octave sparkle.
        Note(freq: 987.77, durationMs: 460, gain: 0.085, startOffsetMs: 0, attackMs: 40, releaseMs: 360, detuneCents: 3),
        Note(freq: 659.25, durationMs: 620, gain: 0.09, startOffsetMs: 150, attackMs: 50, releaseMs: 520, detuneCents: -3),
        Note(freq: 1318.51, durationMs: 420, gain: 0.022, startOffsetMs: 160, attackMs: 70, releaseMs: 360),
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

    /// Gentle descending chime when the conversation is closed ("thank you, Kivo").
    func playClose() {
        Haptics.followUp()
        play(closeData)
    }

    /// Low quiet pulse repeated while Kivo is thinking.
    func startThinkingLoop() {
        guard enabled else { return }
        stopThinkingLoop()
        playPulse()
        let timer = Timer(timeInterval: 2.6, repeats: true) { [weak self] _ in
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
            let attack = min(note.attackMs / 1000.0, dur * 0.5)
            let release = min(note.releaseMs / 1000.0, dur)
            let freq = note.freq * pow(2.0, note.detuneCents / 1200.0)

            for i in 0..<count {
                let idx = start + i
                guard idx < totalSamples else { break }
                let t = Double(i) / sampleRate
                // Soft attack + quadratic release for a calm, click-free bloom.
                let env: Double
                if t < attack {
                    env = t / attack
                } else if t > dur - release {
                    let r = (dur - t) / release
                    env = max(0, r * r)
                } else {
                    env = 1
                }
                let phase = 2 * Double.pi * freq * t
                let wave = note.triangle ? (2.0 / Double.pi) * asin(sin(phase)) : sin(phase)
                samples[idx] += Float(wave * note.gain * env)
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
