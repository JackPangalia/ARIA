import AuthenticationServices
import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var auth: AuthService
    @State private var email = ""
    @State private var password = ""
    @State private var isCreatingAccount = false
    @State private var isBusy = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("KIVO")
                        .font(.system(size: 10, weight: .regular))
                        .tracking(6.5)
                        .foregroundStyle(AriaTheme.foregroundSubtle)
                    Text("Sign in")
                        .font(.system(size: 28, weight: .regular))
                        .foregroundStyle(AriaTheme.foreground)
                    Text("Sign in to open the session.")
                        .font(.system(size: 14))
                        .foregroundStyle(AriaTheme.foregroundMuted)
                }
                .padding(.top, 24)

                VStack(spacing: 14) {
                    TextField("Email", text: $email)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()
                        .padding()
                        .background(AriaTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .foregroundStyle(AriaTheme.foreground)

                    SecureField("Password", text: $password)
                        .padding()
                        .background(AriaTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .foregroundStyle(AriaTheme.foreground)

                    Button { Task { await submitEmail() } } label: {
                        Text(isCreatingAccount ? "Create account" : "Sign in")
                            .font(.system(size: 14))
                            .tracking(1.2)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(AriaTheme.accent)
                    .foregroundStyle(AriaTheme.accentForeground)
                    .disabled(isBusy || email.isEmpty || password.count < 6)

                    Button(isCreatingAccount ? "Already have an account?" : "Need an account?") {
                        isCreatingAccount.toggle()
                    }
                    .font(.footnote)
                    .foregroundStyle(AriaTheme.foregroundMuted)
                }

                VStack(spacing: 12) {
                    if AppConfig.signInWithAppleEnabled {
                        SignInWithAppleButton(.signIn) { request in
                            auth.prepareAppleSignInRequest(request)
                        } onCompletion: { result in
                            Task { await auth.handleAppleSignIn(result: result) }
                        }
                        .signInWithAppleButtonStyle(.white)
                        .frame(height: 48)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }

                    GoogleSignInButton(isBusy: isBusy) {
                        await signInWithGoogle()
                    }
                }

                if let error = auth.errorMessage {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(AriaTheme.danger)
                }
            }
            .padding(AriaTheme.horizontalPadding)
        }
        .background(AriaTheme.background.ignoresSafeArea())
        .preferredColorScheme(.dark)
    }

    private func submitEmail() async {
        isBusy = true
        defer { isBusy = false }
        do {
            if isCreatingAccount {
                try await auth.signUpWithEmail(email: email, password: password)
            } else {
                try await auth.signInWithEmail(email: email, password: password)
            }
        } catch {
            auth.errorMessage = error.localizedDescription
        }
    }

    private func signInWithGoogle() async {
        guard let controller = UIApplication.shared.topViewController else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            try await auth.signInWithGoogle(presenting: controller)
        } catch {
            auth.errorMessage = error.localizedDescription
        }
    }
}

private struct GoogleSignInButton: View {
    let isBusy: Bool
    let action: () async -> Void

    var body: some View {
        Button { Task { await action() } } label: {
            HStack(spacing: 10) {
                Image(systemName: "globe")
                Text("Continue with Google")
            }
            .font(.system(size: 14))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .foregroundStyle(AriaTheme.foreground)
            .background(AriaTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .disabled(isBusy)
    }
}

private extension UIApplication {
    var topViewController: UIViewController? {
        connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .rootViewController?
            .topMostViewController()
    }
}

private extension UIViewController {
    func topMostViewController() -> UIViewController {
        if let presented = presentedViewController { return presented.topMostViewController() }
        if let nav = self as? UINavigationController, let visible = nav.visibleViewController {
            return visible.topMostViewController()
        }
        if let tab = self as? UITabBarController, let selected = tab.selectedViewController {
            return selected.topMostViewController()
        }
        return self
    }
}
