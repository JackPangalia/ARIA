import SwiftUI

/// On-device speaker enrollment — mirrors the web `SpeakerProfilesManager` flow:
/// name → 3-2-1 countdown → 15s read-aloud recording → processing → success.
/// Captures mic audio via `MicPCMStreamer` and runs Speechmatics in enrollment
/// mode to obtain a speaker identifier, then saves a profile.
struct SpeakerEnrollmentView: View {
    let onEnrolled: () -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: ThemeStore
    @StateObject private var model = SpeakerEnrollmentModel()
    @FocusState private var nameFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                orb
                waveform

                Text(model.statusLine)
                    .font(.system(size: 14))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(model.statusColor)
                    .padding(.horizontal, 24)

                if model.phase == .countdown || model.phase == .recording {
                    scriptCard
                } else if model.showsForm {
                    enrollForm
                }

                Spacer()
            }
            .padding(.top, 28)
            .padding(.horizontal, 20)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(AriaTheme.background)
            .navigationTitle("Enroll voice")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(model.isEnrolling ? "Cancel" : "Close") {
                        model.cancel()
                        dismiss()
                    }
                }
            }
            .onChange(of: model.didSucceed) { _, done in
                if done {
                    onEnrolled()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { dismiss() }
                }
            }
            .onDisappear { model.cancel() }
        }
        .preferredColorScheme(theme.colorScheme)
    }

    // MARK: - Orb

    private var orb: some View {
        ZStack {
            Circle()
                .fill(
                    RadialGradient(
                        colors: [model.orbColor.opacity(0.45), .clear],
                        center: .center,
                        startRadius: 4,
                        endRadius: 90
                    )
                )
                .frame(width: 180, height: 180)
                .opacity(model.phase == .recording ? Double(0.4 + model.level * 2.2) : 0.4)

            Circle()
                .fill(
                    RadialGradient(
                        colors: [model.orbColor.opacity(0.9), model.orbColor.opacity(0.5)],
                        center: UnitPoint(x: 0.35, y: 0.3),
                        startRadius: 2,
                        endRadius: 70
                    )
                )
                .frame(width: 120, height: 120)
                .scaleEffect(model.orbScale)
                .animation(.easeOut(duration: 0.1), value: model.orbScale)

            orbContent
        }
        .frame(height: 190)
    }

    @ViewBuilder
    private var orbContent: some View {
        switch model.phase {
        case .countdown:
            Text("\(model.countdown)")
                .font(.system(size: 38, weight: .light))
                .foregroundStyle(.white)
                .id(model.countdown)
                .transition(.scale.combined(with: .opacity))
        case .recording:
            Text("\(model.secondsLeft)")
                .font(.system(size: 30, weight: .light))
                .monospacedDigit()
                .foregroundStyle(.white)
        case .processing:
            ProgressView().tint(.white)
        case .success:
            Image(systemName: "checkmark")
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(.white)
        case .error:
            Image(systemName: "exclamationmark")
                .font(.system(size: 30, weight: .light))
                .foregroundStyle(.white)
        case .idle:
            Image(systemName: "mic.fill")
                .font(.system(size: 28))
                .foregroundStyle(.white)
        }
    }

    private var waveform: some View {
        HStack(spacing: 3) {
            ForEach(Array(model.waveform.enumerated()), id: \.offset) { item in
                let v = item.element
                let active = model.phase == .recording || model.phase == .countdown
                Capsule()
                    .fill(AriaTheme.accent.opacity(active ? Double(0.45 + min(0.55, v * 1.5)) : 0.2))
                    .frame(width: 3, height: active ? CGFloat(max(4, min(28, 4 + v * 60))) : 4)
            }
        }
        .frame(height: 30)
        .animation(.easeOut(duration: 0.1), value: model.waveform)
    }

    private var scriptCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(AppEnrollment.scriptLabel.uppercased())
                .font(.system(size: 10, weight: .medium))
                .tracking(1.8)
                .foregroundStyle(AriaTheme.foregroundMuted)
            Text(AppEnrollment.readAloudScript)
                .font(.system(size: 15))
                .lineSpacing(3)
                .foregroundStyle(AriaTheme.foregroundSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(AriaTheme.surface.opacity(0.5))
                .overlay(alignment: .leading) {
                    Rectangle()
                        .fill(AriaTheme.accent.opacity(0.4))
                        .frame(width: 3)
                }
                .clipShape(RoundedRectangle(cornerRadius: 14))
        )
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(AriaTheme.borderStrong, lineWidth: 1))
    }

    private var enrollForm: some View {
        VStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Speaker name")
                    .font(.system(size: 12))
                    .foregroundStyle(AriaTheme.foregroundMuted)
                TextField("e.g. Alex", text: $model.name)
                    .textInputAutocapitalization(.words)
                    .focused($nameFocused)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 11)
                    .background(RoundedRectangle(cornerRadius: 10).fill(AriaTheme.surface))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(AriaTheme.borderStrong, lineWidth: 1))
                    .foregroundStyle(AriaTheme.foreground)
            }

            Text(AppEnrollment.idleHint)
                .font(.system(size: 12))
                .foregroundStyle(AriaTheme.foregroundSubtle)
                .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                Haptics.tap()
                nameFocused = false
                model.start()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "mic.fill")
                    Text(model.phase == .error ? "Try again" : "Enroll voice")
                }
                .font(.system(size: 15, weight: .medium))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Capsule().fill(AriaTheme.accent))
                .foregroundStyle(AriaTheme.accentForeground)
            }
            .buttonStyle(.plain)
        }
    }
}

private enum AppEnrollment {
    static let readAloudScript =
        "When the sunlight strikes raindrops in the air, they act as a prism and form a rainbow. " +
        "The rainbow is a division of white light into many beautiful colors. " +
        "These take the shape of a long round arch, with its path high above, " +
        "and its two ends apparently beyond the horizon."
    static let scriptLabel = "Read aloud"
    static let idleHint = "15 seconds in a quiet room. The passage appears when recording starts."
}
