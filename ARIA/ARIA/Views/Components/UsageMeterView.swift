import SwiftUI

/// Port of web `UsageMeter.tsx`.
struct UsageMeterView: View {
    let usage: UsageSummary

    var body: some View {
        VStack(spacing: 12) {
            meterBar(
                label: "Listening",
                detail: "\(formatHm(usage.listening.usedSeconds)) / \(formatHm(usage.listening.capSeconds))",
                pct: usage.listening.pct,
                danger: usage.listening.pct >= 90
            )
            meterBar(
                label: "Asks",
                detail: "\(Int(round(usage.asks.pct)))%",
                pct: usage.asks.pct,
                danger: usage.asks.pct >= 90
            )
        }
        .frame(maxWidth: AriaTheme.contentMaxWidth)
    }

    private func meterBar(label: String, detail: String, pct: Double, danger: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label.uppercased())
                    .font(.system(size: 10, weight: .regular))
                    .tracking(1.2)
                    .foregroundStyle(AriaTheme.foregroundMuted)
                Spacer()
                Text(detail)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(AriaTheme.foregroundMuted)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(AriaTheme.surfaceHover)
                    Capsule()
                        .fill(danger ? AriaTheme.danger : AriaTheme.accent)
                        .frame(width: geo.size.width * barWidthFraction(pct))
                        .animation(.easeInOut(duration: 0.5), value: pct)
                }
            }
            .frame(height: 6)
        }
    }

    /// API returns 0–100, matching web `UsageMeter.tsx`.
    private func barWidthFraction(_ pct: Double) -> CGFloat {
        let clamped = min(100, max(2, pct))
        return CGFloat(clamped / 100)
    }

    private func formatHm(_ seconds: Int) -> String {
        let total = max(0, Int(round(Double(seconds) / 60)))
        let h = total / 60
        let m = total % 60
        return h > 0 ? "\(h)h \(m)m" : "\(m)m"
    }
}
