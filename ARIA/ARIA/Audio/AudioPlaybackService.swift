import AVFoundation
import Foundation

@MainActor
final class AudioPlaybackService {
    private var player: AVAudioPlayer?
    private var continuation: CheckedContinuation<Void, Error>?

    func playMP3(data: Data) async throws {
        stop()
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP])
        try session.setActive(true)
        try preferBuiltInMicrophone(on: session)

        let player = try AVAudioPlayer(data: data)
        player.delegate = PlaybackDelegate.shared
        self.player = player
        PlaybackDelegate.shared.owner = self
        player.prepareToPlay()
        player.play()

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            self.continuation = continuation
        }
    }

    func stop() {
        player?.stop()
        player = nil
        continuation?.resume(returning: ())
        continuation = nil
    }

    private func preferBuiltInMicrophone(on session: AVAudioSession) throws {
        guard let builtInMic = session.availableInputs?.first(where: { $0.portType == .builtInMic }) else {
            return
        }
        try session.setPreferredInput(builtInMic)
    }

    fileprivate func finishPlayback(error: Error? = nil) {
        if let error {
            continuation?.resume(throwing: error)
        } else {
            continuation?.resume(returning: ())
        }
        continuation = nil
        player = nil
    }
}

private final class PlaybackDelegate: NSObject, AVAudioPlayerDelegate {
    static let shared = PlaybackDelegate()
    weak var owner: AudioPlaybackService?

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            owner?.finishPlayback(error: flag ? nil : AudioPlaybackError.playbackFailed)
        }
    }

    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in
            owner?.finishPlayback(error: error ?? AudioPlaybackError.decodeFailed)
        }
    }
}

enum AudioPlaybackError: LocalizedError {
    case playbackFailed
    case decodeFailed

    var errorDescription: String? {
        switch self {
        case .playbackFailed: return "Audio playback failed."
        case .decodeFailed: return "Could not decode audio response."
        }
    }
}
