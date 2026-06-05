import SwiftUI

/// Port of web `Controls.tsx` — START / STOP / Resume pill buttons.
struct ControlsView: View {
    let isRunning: Bool
    let resume: Bool
    let disabled: Bool
    let busy: Bool
    let onStart: () -> Void
    let onStop: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            if disabled {
                Text("This session is archived. Resume an active session to listen again.")
                    .font(.system(size: 12))
                    .foregroundStyle(AriaTheme.foregroundMuted)
                    .multilineTextAlignment(.center)
            }

            if isRunning {
                pillButton(title: "STOP", filled: false, action: onStop)
            } else {
                pillButton(title: resume ? "Resume" : "START", filled: true, action: onStart)
            }
        }
        .frame(maxWidth: AriaTheme.contentMaxWidth)
    }

    private func pillButton(title: String, filled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 14, weight: .medium))
                .tracking(1.4)
                .frame(minWidth: 96)
                .padding(.horizontal, 26)
                .padding(.vertical, 12)
                .foregroundStyle(filled ? AriaTheme.accentForeground : AriaTheme.foreground)
                .background(filled ? AriaTheme.accent : AriaTheme.background)
                .clipShape(Capsule())
                .overlay(
                    Capsule()
                        .stroke(AriaTheme.borderStrong, lineWidth: filled ? 0 : 1)
                )
        }
        .buttonStyle(PillButtonStyle())
        .disabled(busy || disabled)
        .opacity(busy || disabled ? 0.4 : 1)
    }
}

private struct PillButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}
