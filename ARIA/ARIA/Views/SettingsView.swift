import FirebaseAuth
import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var auth: AuthService
    @EnvironmentObject private var consent: ConsentStore
    @EnvironmentObject private var theme: ThemeStore
    @Environment(\.dismiss) private var dismiss

    @State private var showDeleteConfirm = false
    @State private var errorMessage: String?
    @State private var usage: UsageSummary?
    @State private var usageLoading = true

    private var displayName: String {
        auth.user?.displayName
            ?? auth.user?.email?.split(separator: "@").first.map(String.init)
            ?? "Account"
    }

    var body: some View {
        NavigationStack {
            List {
                profileSection
                usageSection

                Section("App") {
                    NavigationLink {
                        AppearanceSettingsView()
                    } label: {
                        Label("Appearance", systemImage: "paintbrush")
                    }
                    NavigationLink {
                        BillingSettingsView()
                    } label: {
                        Label("Billing", systemImage: "creditcard")
                    }
                }
                .listRowBackground(AriaTheme.surface)

                Section("Kivo") {
                    NavigationLink {
                        SpeakerProfilesSettingsView()
                    } label: {
                        Label("Speaker profiles", systemImage: "person.2.wave.2")
                    }
                    NavigationLink {
                        ConnectorsSettingsView()
                    } label: {
                        Label("Connectors", systemImage: "puzzlepiece.extension")
                    }
                    NavigationLink {
                        TrashSettingsView()
                    } label: {
                        Label("Trash", systemImage: "trash")
                    }
                }
                .listRowBackground(AriaTheme.surface)

                Section("Privacy") {
                    Link("Privacy Policy", destination: Brand.privacyPolicyURL)
                    Link("Terms of Service", destination: Brand.termsURL)
                    Link("Support", destination: Brand.supportURL)
                    Button("Revoke AI data sharing consent") {
                        Haptics.tap()
                        consent.revokeConsent()
                        dismiss()
                    }
                }
                .listRowBackground(AriaTheme.surface)

                Section("Account") {
                    Button("Sign out", role: .destructive) {
                        Haptics.tap()
                        try? auth.signOut()
                        dismiss()
                    }
                }
                .listRowBackground(AriaTheme.surface)

                Section("Data") {
                    Button("Delete account", role: .destructive) {
                        Haptics.tap()
                        showDeleteConfirm = true
                    }
                }
                .listRowBackground(AriaTheme.surface)

                Section("About") {
                    LabeledContent("App", value: "Kivo")
                    LabeledContent("Wake phrase", value: Brand.wakePhrase)
                    LabeledContent("Version", value: appVersion)
                }
                .listRowBackground(AriaTheme.surface)
            }
            .scrollContentBackground(.hidden)
            .background(AriaTheme.background)
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .confirmationDialog(
                "Delete your account and all sessions?",
                isPresented: $showDeleteConfirm,
                titleVisibility: .visible
            ) {
                Button("Delete account", role: .destructive) {
                    Task { await deleteAccount() }
                }
                Button("Cancel", role: .cancel) {}
            }
            .alert("Error", isPresented: .constant(errorMessage != nil)) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
        .preferredColorScheme(theme.colorScheme)
        .task { await loadUsage() }
        .refreshable { await loadUsage() }
    }

    private var profileSection: some View {
        Section {
            HStack(spacing: 14) {
                ProfileAvatar(name: displayName, photoURL: auth.user?.photoURL, size: 48)
                VStack(alignment: .leading, spacing: 2) {
                    Text(displayName)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(AriaTheme.foreground)
                        .lineLimit(1)
                    if let email = auth.user?.email, !email.isEmpty {
                        Text(email)
                            .font(.system(size: 13))
                            .foregroundStyle(AriaTheme.foregroundMuted)
                            .lineLimit(1)
                    }
                }
                Spacer()
            }
            .padding(.vertical, 4)
            .listRowBackground(AriaTheme.surface)
        }
    }

    private var usageSection: some View {
        Section("Usage") {
            if usageLoading {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .listRowBackground(AriaTheme.surface)
            } else if let usage {
                UsageMeterView(usage: usage)
                    .listRowBackground(AriaTheme.surface)
                    .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
            } else {
                Text("Unable to load usage.")
                    .font(.system(size: 14))
                    .foregroundStyle(AriaTheme.foregroundMuted)
                    .listRowBackground(AriaTheme.surface)
            }
        }
    }

    private var appVersion: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }

    private func loadUsage() async {
        usageLoading = true
        defer { usageLoading = false }
        do {
            usage = try await APIClient.shared.getUsage()
        } catch {
            usage = nil
        }
    }

    private func deleteAccount() async {
        do {
            try await auth.deleteAccount()
            consent.revokeConsent()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Reusable avatar

struct ProfileAvatar: View {
    let name: String
    let photoURL: URL?
    var size: CGFloat = 36

    private var initial: String { String(name.prefix(1)).uppercased() }

    var body: some View {
        Group {
            if let photoURL {
                AsyncImage(url: photoURL) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var placeholder: some View {
        Circle()
            .fill(
                LinearGradient(
                    colors: [
                        Color(red: 99 / 255, green: 102 / 255, blue: 241 / 255),
                        Color(red: 168 / 255, green: 85 / 255, blue: 247 / 255),
                        Color(red: 236 / 255, green: 72 / 255, blue: 153 / 255),
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay {
                Text(initial)
                    .font(.system(size: size * 0.4, weight: .medium))
                    .foregroundStyle(.white)
            }
    }
}

// MARK: - Speaker profiles

struct SpeakerProfilesSettingsView: View {
    @State private var profiles: [SpeakerProfileDoc] = []
    @State private var loading = true
    @State private var errorMessage: String?
    @State private var showEnroll = false
    @State private var renameTarget: SpeakerProfileDoc?
    @State private var renameText = ""

    var body: some View {
        List {
            Section {
                Text("People Kivo has learned to recognize by voice. Enroll one person at a time in a quiet room.")
                    .font(.system(size: 13))
                    .foregroundStyle(AriaTheme.foregroundMuted)
                    .listRowBackground(AriaTheme.surface)
            }

            Section {
                Button {
                    Haptics.tap()
                    showEnroll = true
                } label: {
                    Label("Enroll a voice", systemImage: "mic.badge.plus")
                        .foregroundStyle(AriaTheme.foreground)
                }
                .listRowBackground(AriaTheme.surface)
            }

            Section("Enrolled") {
                if loading {
                    HStack { Spacer(); ProgressView(); Spacer() }
                        .listRowBackground(AriaTheme.surface)
                } else if profiles.isEmpty {
                    Text("No speaker profiles yet.")
                        .font(.system(size: 14))
                        .foregroundStyle(AriaTheme.foregroundMuted)
                        .listRowBackground(AriaTheme.surface)
                } else {
                    ForEach(profiles) { profile in
                        HStack(spacing: 12) {
                            ProfileAvatar(name: profile.name, photoURL: nil, size: 32)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(profile.name)
                                    .font(.system(size: 15))
                                    .foregroundStyle(AriaTheme.foreground)
                                Text("Voice enrolled")
                                    .font(.system(size: 12))
                                    .foregroundStyle(AriaTheme.foregroundMuted)
                            }
                            Spacer()
                        }
                        .listRowBackground(AriaTheme.surface)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                Task { await delete(profile) }
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                            Button {
                                renameTarget = profile
                                renameText = profile.name
                            } label: {
                                Label("Rename", systemImage: "pencil")
                            }
                            .tint(AriaTheme.foregroundSecondary)
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AriaTheme.background)
        .navigationTitle("Speaker profiles")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showEnroll) {
            SpeakerEnrollmentView(onEnrolled: { Task { await load() } })
        }
        .alert("Rename speaker", isPresented: Binding(
            get: { renameTarget != nil },
            set: { if !$0 { renameTarget = nil } }
        )) {
            TextField("Name", text: $renameText)
            Button("Cancel", role: .cancel) { renameTarget = nil }
            Button("Save") { Task { await rename() } }
        }
        .alert("Error", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            profiles = try await APIClient.shared.listSpeakerProfiles()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func delete(_ profile: SpeakerProfileDoc) async {
        do {
            try await APIClient.shared.deleteSpeakerProfile(profile.id)
            profiles.removeAll { $0.id == profile.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func rename() async {
        guard let target = renameTarget else { return }
        let trimmed = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
        renameTarget = nil
        guard !trimmed.isEmpty, trimmed != target.name else { return }
        do {
            _ = try await APIClient.shared.patchSpeakerProfile(
                target.id, PatchSpeakerProfileRequest(name: trimmed)
            )
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Trash

struct TrashSettingsView: View {
    @State private var sessions: [SessionDoc] = []
    @State private var loading = true
    @State private var busyId: String?
    @State private var confirmDeleteId: String?
    @State private var errorMessage: String?

    var body: some View {
        List {
            Section {
                Text("Trashed sessions are hidden from the sidebar. Restore them or delete them forever.")
                    .font(.system(size: 13))
                    .foregroundStyle(AriaTheme.foregroundMuted)
                    .listRowBackground(AriaTheme.surface)
            }

            Section {
                if loading {
                    HStack { Spacer(); ProgressView(); Spacer() }
                        .listRowBackground(AriaTheme.surface)
                } else if sessions.isEmpty {
                    Text("Trash is empty.")
                        .font(.system(size: 14))
                        .foregroundStyle(AriaTheme.foregroundMuted)
                        .listRowBackground(AriaTheme.surface)
                } else {
                    ForEach(sessions) { session in
                        trashRow(session)
                            .listRowBackground(AriaTheme.surface)
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AriaTheme.background)
        .navigationTitle("Trash")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog(
            "Delete this session forever?",
            isPresented: deleteConfirmBinding,
            titleVisibility: .visible
        ) {
            Button("Delete forever", role: .destructive) {
                if let id = confirmDeleteId {
                    Task { await deleteForever(id) }
                }
            }
            Button("Cancel", role: .cancel) { confirmDeleteId = nil }
        }
        .alert("Error", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private func trashRow(_ session: SessionDoc) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(session.title)
                .font(.system(size: 15))
                .foregroundStyle(AriaTheme.foreground)
                .lineLimit(1)
            HStack(spacing: 10) {
                Button("Restore") {
                    Haptics.tap()
                    Task { await restore(session.id) }
                }
                .buttonStyle(.bordered)
                .tint(AriaTheme.foregroundSecondary)

                Button("Delete forever", role: .destructive) {
                    Haptics.tap()
                    confirmDeleteId = session.id
                }
                .buttonStyle(.bordered)

                Spacer()

                if busyId == session.id {
                    ProgressView()
                }
            }
            .font(.system(size: 13))
            .disabled(busyId == session.id)
        }
        .padding(.vertical, 4)
    }

    private var deleteConfirmBinding: Binding<Bool> {
        Binding(
            get: { confirmDeleteId != nil },
            set: { if !$0 { confirmDeleteId = nil } }
        )
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            sessions = try await APIClient.shared.listTrashedSessions()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func restore(_ id: String) async {
        busyId = id
        defer { busyId = nil }
        do {
            _ = try await APIClient.shared.patchSession(id, status: .active)
            sessions.removeAll { $0.id == id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteForever(_ id: String) async {
        busyId = id
        defer { busyId = nil }
        do {
            try await APIClient.shared.deleteSession(id)
            sessions.removeAll { $0.id == id }
            confirmDeleteId = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
