import SwiftUI

struct ConsentView: View {
    @EnvironmentObject private var consent: ConsentStore
    @EnvironmentObject private var theme: ThemeStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Before you start")
                    .font(.system(size: 28, weight: .regular))
                    .foregroundStyle(AriaTheme.foreground)

                Text("Kivo sends personal data to third-party AI services so it can transcribe conversations, generate answers, and speak responses aloud.")
                    .font(.system(size: 14))
                    .foregroundStyle(AriaTheme.foregroundMuted)

                VStack(alignment: .leading, spacing: 16) {
                    ConsentProviderRow(name: "Speechmatics", detail: "Live audio is streamed for transcription and speaker identification.")
                    ConsentProviderRow(name: "Google Gemini", detail: "Questions and recent session context are sent to generate answers.")
                    ConsentProviderRow(name: "Cartesia", detail: "Answer text is sent to create spoken responses.")
                    ConsentProviderRow(name: "Firebase", detail: "Account, session, and transcript data are stored securely.")
                }
                .padding(.vertical, 8)

                Text("Microphone access is requested only when you tap Start. You can revoke consent or delete your account anytime in Settings.")
                    .font(.footnote)
                    .foregroundStyle(AriaTheme.foregroundSubtle)

                Link("Privacy Policy", destination: Brand.privacyPolicyURL)
                    .font(.footnote)
                    .foregroundStyle(AriaTheme.foregroundSecondary)

                Button { consent.acceptAIDataSharing() } label: {
                    Text("I agree and want to continue")
                        .font(.system(size: 14))
                        .tracking(1.2)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.borderedProminent)
                .tint(AriaTheme.accent)
                .foregroundStyle(AriaTheme.accentForeground)
            }
            .padding(AriaTheme.horizontalPadding)
        }
        .background(AriaTheme.background.ignoresSafeArea())
        .preferredColorScheme(theme.colorScheme)
    }
}

private struct ConsentProviderRow: View {
    let name: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(name)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(AriaTheme.foreground)
            Text(detail)
                .font(.system(size: 14))
                .foregroundStyle(AriaTheme.foregroundMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
