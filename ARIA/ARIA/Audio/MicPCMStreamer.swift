import AVFoundation
import Foundation

@MainActor
final class MicPCMStreamer {
    private let targetSampleRate: Double = 16_000
    private var engine: AVAudioEngine?
    private var converter: AVAudioConverter?
    private var onPCM: ((Data) -> Void)?

    func start(onPCM: @escaping (Data) -> Void) async throws {
        self.onPCM = onPCM

        let session = AVAudioSession.sharedInstance()
        // Avoid Bluetooth HFP for speaker identification: it is narrow-band and
        // changes the voice enough that web-enrolled profiles often miss.
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP])
        try session.setActive(true)
        try preferBuiltInMicrophone(on: session)

        let engine = AVAudioEngine()
        self.engine = engine

        let inputNode = engine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)

        guard let outputFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: targetSampleRate,
            channels: 1,
            interleaved: true
        ) else {
            throw MicPCMStreamerError.formatUnavailable
        }

        converter = AVAudioConverter(from: inputFormat, to: outputFormat)
        // Match web ScriptProcessor(4096) cadence (~85 ms) for responsive orb energy.
        let bufferSize = AVAudioFrameCount(min(4096, max(1024, Int(inputFormat.sampleRate * 0.05))))

        inputNode.installTap(onBus: 0, bufferSize: bufferSize, format: inputFormat) { [weak self] buffer, _ in
            guard let self, let converter = self.converter else { return }
            let frameCapacity = AVAudioFrameCount(
                Double(buffer.frameLength) * self.targetSampleRate / inputFormat.sampleRate
            )
            guard let convertedBuffer = AVAudioPCMBuffer(
                pcmFormat: outputFormat,
                frameCapacity: max(frameCapacity, 1)
            ) else { return }

            var error: NSError?
            let inputBlock: AVAudioConverterInputBlock = { _, outStatus in
                outStatus.pointee = .haveData
                return buffer
            }
            converter.convert(to: convertedBuffer, error: &error, withInputFrom: inputBlock)
            guard error == nil, let channelData = convertedBuffer.int16ChannelData else { return }

            let frameLength = Int(convertedBuffer.frameLength)
            let data = Data(
                bytes: channelData[0],
                count: frameLength * MemoryLayout<Int16>.size
            )
            Task { @MainActor in
                self.onPCM?(data)
            }
        }

        engine.prepare()
        try engine.start()
    }

    private func preferBuiltInMicrophone(on session: AVAudioSession) throws {
        guard let builtInMic = session.availableInputs?.first(where: { $0.portType == .builtInMic }) else {
            return
        }
        try session.setPreferredInput(builtInMic)
        #if DEBUG
        let inputRoute = session.currentRoute.inputs.map(\.portName).joined(separator: ", ")
        let outputRoute = session.currentRoute.outputs.map(\.portName).joined(separator: ", ")
        print("[ARIA] audio │ input=\(inputRoute.isEmpty ? "unknown" : inputRoute) output=\(outputRoute.isEmpty ? "unknown" : outputRoute)")
        #endif
    }

    func stop() {
        engine?.inputNode.removeTap(onBus: 0)
        engine?.stop()
        engine = nil
        converter = nil
        onPCM = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    static func pcmLevel(from data: Data) -> Float {
        guard data.count >= 2 else { return 0 }
        let count = data.count / MemoryLayout<Int16>.size
        var sum: Float = 0
        data.withUnsafeBytes { raw in
            let samples = raw.bindMemory(to: Int16.self)
            for i in 0..<count {
                let v = Float(samples[i]) / 32_768
                sum += v * v
            }
        }
        return sqrt(sum / Float(max(count, 1)))
    }
}

enum MicPCMStreamerError: LocalizedError {
    case formatUnavailable

    var errorDescription: String? {
        switch self {
        case .formatUnavailable:
            return "Unable to configure microphone audio format."
        }
    }
}
