import SwiftUI

/// Port of web `OrbVisualizer.tsx`.
struct OrbVisualizerView: View {
    let status: AriaStatus
    let micLevel: Float
    let sessionTitle: String?
    let resume: Bool
    let errorMessage: String?

    private var mode: OrbMode { OrbMode.from(status: status) }

    private var energy: Float {
        switch mode {
        case .listen, .wake, .followUp:
            return min(1, micLevel * 10)
        case .speak:
            return 0.40
        case .think:
            return 0.25
        case .idle:
            return 0
        }
    }

    private var showSessionTitle: Bool {
        status == .idle && resume && !(sessionTitle?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    }

    private var statusLabel: String {
        if showSessionTitle, let sessionTitle {
            return sessionTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return OrbMode.statusLabel(for: status)
    }

    var body: some View {
        VStack(spacing: 16) {
            // Layout footprint stays small; canvas overflows centered (web OrbVisualizer fix).
            Color.clear
                .frame(width: AriaTheme.orbSize, height: AriaTheme.orbSize)
                .overlay {
                    OrbParticlesView(color: mode.accent, energy: energy)
                        .frame(
                            width: AriaTheme.orbSize * AriaTheme.orbCanvasScale,
                            height: AriaTheme.orbSize * AriaTheme.orbCanvasScale
                        )
                }
                .scaleEffect(AriaTheme.orbScalePhone)
                .padding(.vertical, AriaTheme.orbVerticalPull)

            VStack(spacing: 4) {
                Group {
                    if showSessionTitle {
                        Text(statusLabel)
                            .font(.system(size: 14, weight: .regular))
                            .foregroundStyle(AriaTheme.foregroundSecondary)
                            .lineLimit(1)
                    } else {
                        Text(statusLabel + (mode == .think ? "…" : ""))
                            .font(.system(size: 11, weight: .regular))
                            .tracking(2.4)
                            .textCase(.uppercase)
                            .foregroundStyle(status == .idle ? AriaTheme.foregroundMuted : mode.accent)
                    }
                }
                .multilineTextAlignment(.center)
                .frame(maxWidth: 280)
                .animation(.easeInOut(duration: 0.3), value: mode)

                if let errorMessage, !errorMessage.isEmpty {
                    Text(errorMessage)
                        .font(.system(size: 12))
                        .foregroundStyle(Color.red.opacity(0.85))
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 280)
                }
            }
        }
    }
}
