import SafariServices
import SwiftUI

/// In-app Safari sheet for web OAuth (connectors) and the Stripe billing portal.
struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }
    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

// MARK: - Appearance

struct AppearanceSettingsView: View {
    @EnvironmentObject private var theme: ThemeStore

    var body: some View {
        List {
            Section {
                Picker("Appearance", selection: $theme.preference) {
                    ForEach(AppearancePreference.allCases) { pref in
                        Label(pref.label, systemImage: pref.symbol).tag(pref)
                    }
                }
                .pickerStyle(.inline)
                .listRowBackground(AriaTheme.surface)
            } footer: {
                Text("Choose how Kivo looks. System follows your device setting.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(AriaTheme.background)
        .navigationTitle("Appearance")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Billing (read-only)

struct BillingSettingsView: View {
    @State private var usage: UsageSummary?
    @State private var loading = true
    @State private var portalURL: IdentifiedURL?
    @State private var busy = false
    @State private var errorMessage: String?

    var body: some View {
        List {
            Section("Plan") {
                if loading {
                    HStack { Spacer(); ProgressView(); Spacer() }
                        .listRowBackground(AriaTheme.surface)
                } else {
                    LabeledContent("Current plan", value: usage?.tier.displayName ?? "Free")
                        .listRowBackground(AriaTheme.surface)
                }
            }

            if let usage {
                Section("Usage") {
                    UsageMeterView(usage: usage)
                        .listRowBackground(AriaTheme.surface)
                        .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
                }
            }

            Section {
                Button {
                    Task { await openPortal() }
                } label: {
                    HStack {
                        Label("Manage on web", systemImage: "creditcard")
                            .foregroundStyle(AriaTheme.foreground)
                        Spacer()
                        if busy { ProgressView() }
                    }
                }
                .disabled(busy)
                .listRowBackground(AriaTheme.surface)
            } footer: {
                Text("Upgrades, downgrades, and payment methods are managed on the web.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(AriaTheme.background)
        .navigationTitle("Billing")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(item: $portalURL) { item in SafariView(url: item.url) }
        .alert("Error", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        usage = try? await APIClient.shared.getUsage()
    }

    private func openPortal() async {
        busy = true
        defer { busy = false }
        do {
            portalURL = IdentifiedURL(url: try await APIClient.shared.billingPortalURL())
        } catch {
            errorMessage = "Billing isn't available right now. Try again on the web."
        }
    }
}

// MARK: - Connectors

struct ConnectorsSettingsView: View {
    @State private var connections: [ConnectionSummary] = []
    @State private var loading = true
    @State private var busySlug: String?
    @State private var oauthURL: IdentifiedURL?
    @State private var errorMessage: String?

    var body: some View {
        List {
            Section {
                Text("Connect apps so Kivo can pull in context and take actions during a conversation.")
                    .font(.system(size: 13))
                    .foregroundStyle(AriaTheme.foregroundMuted)
                    .listRowBackground(AriaTheme.surface)
            }

            Section {
                if loading {
                    HStack { Spacer(); ProgressView(); Spacer() }
                        .listRowBackground(AriaTheme.surface)
                } else {
                    ForEach(SupportedToolkit.all) { app in
                        connectorRow(app)
                            .listRowBackground(AriaTheme.surface)
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AriaTheme.background)
        .navigationTitle("Connectors")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $oauthURL, onDismiss: { Task { await load() } }) { item in
            SafariView(url: item.url)
        }
        .alert("Error", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private func connectorRow(_ app: SupportedToolkit) -> some View {
        let connection = connections.first { $0.toolkit == app.slug && $0.isActive }
        return HStack(spacing: 12) {
            Image(systemName: app.symbol)
                .font(.system(size: 16))
                .foregroundStyle(AriaTheme.foregroundSecondary)
                .frame(width: 28, height: 28)
            Text(app.label)
                .font(.system(size: 15))
                .foregroundStyle(AriaTheme.foreground)
            Spacer()
            if busySlug == app.slug {
                ProgressView()
            } else if let connection {
                Button("Disconnect", role: .destructive) {
                    Task { await disconnect(connection) }
                }
                .font(.system(size: 13))
                .buttonStyle(.bordered)
            } else {
                Button("Connect") {
                    Task { await connect(app) }
                }
                .font(.system(size: 13))
                .buttonStyle(.bordered)
                .tint(AriaTheme.foregroundSecondary)
            }
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        connections = (try? await APIClient.shared.listConnections()) ?? []
    }

    private func connect(_ app: SupportedToolkit) async {
        busySlug = app.slug
        defer { busySlug = nil }
        do {
            if let url = try await APIClient.shared.initiateConnection(toolkit: app.slug) {
                oauthURL = IdentifiedURL(url: url)
            } else {
                await load()
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func disconnect(_ connection: ConnectionSummary) async {
        busySlug = connection.toolkit
        defer { busySlug = nil }
        do {
            try await APIClient.shared.deleteConnection(id: connection.id)
            connections.removeAll { $0.id == connection.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// Wraps a URL so it can drive `.sheet(item:)` without a retroactive conformance.
struct IdentifiedURL: Identifiable {
    let id = UUID()
    let url: URL
}
