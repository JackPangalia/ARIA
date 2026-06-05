import FirebaseCore
import GoogleSignIn
import SwiftUI

@main
struct ARIAApp: App {
    @StateObject private var auth: AuthService
    @StateObject private var consent: ConsentStore

    init() {
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        let auth = AuthService.shared
        auth.configure()
        _auth = StateObject(wrappedValue: auth)
        _consent = StateObject(wrappedValue: ConsentStore.shared)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environmentObject(consent)
                .onOpenURL { url in
                    GIDSignIn.sharedInstance.handle(url)
                }
        }
    }
}
