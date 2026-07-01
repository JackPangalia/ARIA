import SwiftUI

struct RootView: View {
    @EnvironmentObject private var auth: AuthService
    @EnvironmentObject private var consent: ConsentStore
    @EnvironmentObject private var theme: ThemeStore

    var body: some View {
        Group {
            if auth.isLoading {
                ProgressView("Loading…")
                    .tint(AriaTheme.accent)
            } else if auth.user == nil {
                SignInView()
            } else if consent.needsConsent {
                ConsentView()
            } else {
                AppWorkspaceView()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AriaTheme.background.ignoresSafeArea())
        .foregroundStyle(AriaTheme.foreground)
        .preferredColorScheme(theme.colorScheme)
    }
}

#Preview {
    RootView()
        .environmentObject(AuthService.shared)
        .environmentObject(ConsentStore.shared)
        .environmentObject(ThemeStore())
}
