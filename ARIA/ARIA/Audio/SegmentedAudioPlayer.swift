import AVFoundation
import Foundation

/// Plays a streamed MP3 answer sentence-by-sentence so Kivo starts speaking after
/// the first sentence instead of buffering the whole answer.
///
/// Handles two server shapes, decided from the first bytes:
///  - **framed** (`application/x-kivo-audio-frames`): `[uint32 big-endian length]
///    [mp3]` per sentence. Used once the server deploys framing.
///  - **raw** (`audio/mpeg`): one progressively-streamed body that is really a
///    run of self-contained MP3 sentences concatenated back to back, each
///    starting with an `ID3` tag. We split on validated `ID3` headers so we get
///    the same streaming behaviour against a server that hasn't deployed framing.
///
/// Either way each sentence is played with `AVAudioPlayer` (not a second
/// `AVAudioEngine`) so it coexists with the live mic engine exactly like the cue
/// sounds do. Falls back to playing the whole buffer if no boundaries are found.
@MainActor
final class SegmentedAudioPlayer: NSObject {
    private enum Mode { case unknown, framed, raw }

    /// A real per-sentence MP3 is a few KB–tens of KB. A raw MP3's first 4 bytes
    /// read as a length are in the billions (ID3 / 0xFF sync), so anything past
    /// this cap means "not framed."
    private let maxSegmentBytes = 8_000_000

    private var mode: Mode = .unknown
    private var buffer = Data()
    /// Raw mode only: start of the current (not-yet-complete) sentence. The raw
    /// buffer is never trimmed from the front, so these are plain 0-based offsets.
    private var rawSegStart = 0

    private var pendingSegments: [Data] = []
    private var currentPlayer: AVAudioPlayer?
    private var producerFinished = false
    private var started = false
    private var stopped = false
    private var firstSegmentFired = false
    private var segmentCount = 0
    private var totalBytes = 0
    private var onFirstSegment: (() -> Void)?
    private var completion: CheckedContinuation<Void, Error>?

    /// Activates the audio session and arms playback. `onFirstSegment` fires once,
    /// when the first segment actually begins playing — flip UI to speaking there.
    func start(onFirstSegment: @escaping () -> Void) throws {
        self.onFirstSegment = onFirstSegment
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP])
        try session.setActive(true)
        if let builtInMic = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
            try? session.setPreferredInput(builtInMic)
        }
        started = true
        debugLog("started")
    }

    /// Feed response bytes as they arrive; complete sentences are parsed and queued.
    func append(_ data: Data) {
        guard started, !stopped, !data.isEmpty else { return }
        totalBytes += data.count
        buffer.append(data)
        if mode == .unknown { detectMode() }
        switch mode {
        case .framed: parseFramedSegments()
        case .raw: parseRawSegments()
        case .unknown: break
        }
        playNextIfIdle()
    }

    /// No more bytes will arrive; flush the final sentence and resolve once played.
    func finish() async throws {
        producerFinished = true
        if mode == .raw {
            // The trailing sentence has no following ID3 to bound it — flush it now.
            if rawSegStart < buffer.count {
                pendingSegments.append(buffer.subdata(in: rawSegStart..<buffer.count))
                segmentCount += 1
                rawSegStart = buffer.count
            }
        } else if !firstSegmentFired, !buffer.isEmpty {
            // Framed produced nothing, or mode never resolved — play the whole body.
            debugLog("no segments parsed (\(totalBytes) bytes) — playing whole buffer")
            pendingSegments.append(Data(buffer))
            buffer.removeAll()
        }
        playNextIfIdle()
        if isDrained {
            resolve(throwing: nil)
            return
        }
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            self.completion = cont
        }
    }

    /// Aborts playback immediately (barge-in / cancel) and resolves any waiter.
    func stop() {
        guard !stopped else { return }
        stopped = true
        currentPlayer?.stop()
        currentPlayer = nil
        pendingSegments.removeAll()
        buffer.removeAll()
        resolve(throwing: nil)
    }

    private var isDrained: Bool {
        producerFinished && pendingSegments.isEmpty && currentPlayer == nil
    }

    private func detectMode() {
        guard buffer.count >= 4 else { return }
        var len = 0
        for byte in buffer.prefix(4) { len = (len << 8) | Int(byte) }
        if len > 0 && len <= maxSegmentBytes {
            mode = .framed
            debugLog("framed stream")
        } else {
            mode = .raw
            rawSegStart = 0
            debugLog("raw MP3 stream — splitting on ID3 boundaries")
        }
    }

    /// Framed: consume `[uint32 length][mp3]` records from the front of the buffer.
    private func parseFramedSegments() {
        while buffer.count >= 4 {
            var len = 0
            for byte in buffer.prefix(4) { len = (len << 8) | Int(byte) }
            guard len > 0, len <= maxSegmentBytes else {
                // First record looked framed but a later one didn't — bail to raw.
                // Re-base to a fresh 0-indexed buffer since framed parsing trims
                // from the front, then re-scan as raw.
                mode = .raw
                buffer = Data(buffer)
                rawSegStart = 0
                parseRawSegments()
                return
            }
            let total = 4 + len
            guard buffer.count >= total else { break }
            let start = buffer.index(buffer.startIndex, offsetBy: 4)
            let end = buffer.index(buffer.startIndex, offsetBy: total)
            pendingSegments.append(Data(buffer[start..<end]))
            segmentCount += 1
            buffer.removeSubrange(buffer.startIndex..<end)
        }
    }

    /// Raw: a sentence ends where the next sentence's `ID3` header begins. Emit
    /// each completed sentence; the final one is flushed in `finish()`.
    private func parseRawSegments() {
        let count = buffer.count
        var i = rawSegStart + 3
        while i + 10 <= count {
            if isID3Header(at: i) {
                if i > rawSegStart {
                    pendingSegments.append(buffer.subdata(in: rawSegStart..<i))
                    segmentCount += 1
                }
                rawSegStart = i
                i += 3
            } else {
                i += 1
            }
        }
    }

    /// Strict ID3v2 header check (raw buffer is 0-based), to avoid splitting on
    /// stray `ID3` byte sequences inside audio data.
    private func isID3Header(at offset: Int) -> Bool {
        guard offset >= 0, offset + 10 <= buffer.count else { return false }
        guard buffer[offset] == 0x49, buffer[offset + 1] == 0x44, buffer[offset + 2] == 0x33 else { return false } // "ID3"
        let versionMajor = buffer[offset + 3]
        guard versionMajor >= 0x02, versionMajor <= 0x05, buffer[offset + 4] != 0xFF else { return false }
        // Syncsafe 28-bit size: the four size bytes each have the high bit clear.
        return buffer[offset + 6] < 0x80
            && buffer[offset + 7] < 0x80
            && buffer[offset + 8] < 0x80
            && buffer[offset + 9] < 0x80
    }

    private func playNextIfIdle() {
        guard !stopped, currentPlayer == nil, !pendingSegments.isEmpty else { return }
        let segment = pendingSegments.removeFirst()
        do {
            let player = try AVAudioPlayer(data: segment)
            player.delegate = self
            player.prepareToPlay()
            guard player.play() else {
                debugLog("play() returned false — skipping segment (\(segment.count) bytes)")
                playNextIfIdle()
                return
            }
            currentPlayer = player
            if !firstSegmentFired {
                firstSegmentFired = true
                debugLog("first segment playing (\(segment.count) bytes)")
                onFirstSegment?()
            }
        } catch {
            debugLog("AVAudioPlayer init failed (\(segment.count) bytes): \(error.localizedDescription)")
            playNextIfIdle()
        }
    }

    fileprivate func handleSegmentFinished() {
        currentPlayer = nil
        if !pendingSegments.isEmpty {
            playNextIfIdle()
        } else if isDrained {
            debugLog("playback drained (\(segmentCount) segments)")
            resolve(throwing: nil)
        }
        // Otherwise: idle, waiting for the producer to deliver more segments.
    }

    private func resolve(throwing error: Error?) {
        let cont = completion
        completion = nil
        if let error {
            cont?.resume(throwing: error)
        } else {
            cont?.resume()
        }
    }

    private func debugLog(_ message: String) {
        #if DEBUG
        print("[ARIA] audio │ SegmentedAudioPlayer: \(message)")
        #endif
    }
}

extension SegmentedAudioPlayer: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor [weak self] in
            self?.handleSegmentFinished()
        }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor [weak self] in
            self?.handleSegmentFinished()
        }
    }
}
