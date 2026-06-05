import SwiftUI

/// Full-screen transcript overlay — speaker-labeled lines with Kivo answers set
/// apart as subtle cards. Mirrors web `SessionInsightsPanel.tsx`.
struct TranscriptPanelView: View {
    let turns: [TurnDoc]
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollViewReader { proxy in
                ScrollView {
                    if turns.isEmpty {
                        Text("No transcript yet. Start listening and lines will appear here.")
                            .font(.system(size: 14))
                            .foregroundStyle(AriaTheme.foregroundMuted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 28)
                            .padding(.horizontal, 4)
                    } else {
                        LazyVStack(alignment: .leading, spacing: 14) {
                            ForEach(turns) { turn in
                                turnRow(turn)
                                    .id(turn.id)
                            }
                        }
                        .padding(.top, 4)
                        .padding(.bottom, 24)
                    }
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: turns.last?.id) { _, lastId in
                    if let lastId {
                        withAnimation { proxy.scrollTo(lastId, anchor: .bottom) }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AriaTheme.background)
    }

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Transcript")
                    .font(.system(size: 11, weight: .medium))
                    .tracking(2)
                    .textCase(.uppercase)
                    .foregroundStyle(AriaTheme.foregroundMuted)
                if !turns.isEmpty {
                    Text("\(turns.count) turn\(turns.count == 1 ? "" : "s")")
                        .font(.system(size: 12))
                        .foregroundStyle(AriaTheme.foregroundSubtle)
                }
            }
            Spacer()
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(AriaTheme.foregroundMuted)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(AriaTheme.surface))
                    .overlay(Circle().stroke(AriaTheme.borderStrong, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    private func turnRow(_ turn: TurnDoc) -> some View {
        // Uniform typography for every speaker, including Kivo — only the label
        // text differs by role.
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 8) {
                Text(turnLabel(turn))
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(0.8)
                    .textCase(.uppercase)
                    .foregroundStyle(AriaTheme.foregroundMuted)
                    .lineLimit(1)
                if let time = Self.timeString(turn.createdAt) {
                    Text(time)
                        .font(.system(size: 11))
                        .foregroundStyle(AriaTheme.foregroundSubtle)
                }
            }
            Text(turn.text)
                .font(.system(size: 15))
                .lineSpacing(3)
                .foregroundStyle(AriaTheme.foregroundSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 4)
    }

    private func turnLabel(_ turn: TurnDoc) -> String {
        switch turn.role {
        case .assistant:
            return "Kivo"
        case .userQuestion, .speaker:
            return turn.displaySpeakerName ?? "Other speaker"
        }
    }

    private static let isoParsers: [ISO8601DateFormatter] = {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return [withFraction, plain]
    }()

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.timeStyle = .short
        f.dateStyle = .none
        return f
    }()

    private static func timeString(_ iso: String) -> String? {
        guard let date = isoParsers.lazy.compactMap({ $0.date(from: iso) }).first else {
            return nil
        }
        return timeFormatter.string(from: date)
    }
}
