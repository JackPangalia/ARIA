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
    private var pulseStartTimer: Timer?
    /// Fast answers should be silent — the pulse only starts once a think has
    /// gone on long enough that the user might wonder whether Kivo heard them.
    /// Mirrors the web cue engine's PULSE_START_DELAY_MS.
    private let pulseStartDelay: TimeInterval = 1.5

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
    // The set is deliberately minimal — one short quiet acknowledgment where
    // state genuinely needs confirming, silence elsewhere; multi-note chimes
    // read as gimmicky next to a natural back-and-forth.
    private lazy var wakeData = makeWav([
        // A single soft tick — "I'm listening" — over in under 200ms.
        Note(freq: 830.61, durationMs: 170, gain: 0.06, startOffsetMs: 0, attackMs: 12, releaseMs: 140),
    ])
    private lazy var errorData = makeWav([
        // Short low descending pair — clearly "that didn't work", kept brief.
        Note(freq: 440.0, durationMs: 220, gain: 0.08, startOffsetMs: 0, attackMs: 20, releaseMs: 180, triangle: true),
        Note(freq: 349.23, durationMs: 260, gain: 0.08, startOffsetMs: 120, attackMs: 24, releaseMs: 220, triangle: true),
    ])
    private lazy var pulseData = makeWav([
        // Faint, slow low-fifth breath (A2 + E3).
        Note(freq: 110.0, durationMs: 900, gain: 0.05, startOffsetMs: 0, attackMs: 180, releaseMs: 600),
        Note(freq: 164.81, durationMs: 820, gain: 0.03, startOffsetMs: 0, attackMs: 200, releaseMs: 560),
    ])
    private lazy var closeData = makeWav([
        // One low, warm note — a quiet "goodbye" without a melody.
        Note(freq: 392.0, durationMs: 300, gain: 0.06, startOffsetMs: 0, attackMs: 20, releaseMs: 250),
    ])

    // MARK: - Cues (each paired with a matching haptic)

    /// Bright ascending two-note when the wake word fires.
    func playWake() {
        Haptics.wake()
        play(wakeData)
    }

    /// Follow-up window opening is haptic-only — it fires after every answer,
    /// and a chime there is the biggest source of "talking to a gadget" feel.
    func playFollowUp() {
        Haptics.followUp()
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

    /// Low quiet pulse repeated while Kivo is thinking. Silent at first — most
    /// answers start speaking before the delay elapses and never need a cue.
    func startThinkingLoop() {
        guard enabled else { return }
        stopThinkingLoop()
        let startTimer = Timer(timeInterval: pulseStartDelay, repeats: false) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.pulseStartTimer = nil
                self.playPulse()
                let timer = Timer(timeInterval: 2.6, repeats: true) { [weak self] _ in
                    Task { @MainActor in self?.playPulse() }
                }
                RunLoop.main.add(timer, forMode: .common)
                self.pulseTimer = timer
            }
        }
        RunLoop.main.add(startTimer, forMode: .common)
        pulseStartTimer = startTimer
    }

    func stopThinkingLoop() {
        pulseStartTimer?.invalidate()
        pulseStartTimer = nil
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
