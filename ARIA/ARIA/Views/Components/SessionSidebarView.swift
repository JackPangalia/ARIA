import FirebaseAuth
import SwiftUI

struct SidebarUserInfo {
    let displayName: String
    let email: String
    let photoURL: URL?

    init?(firebaseUser: FirebaseAuth.User?) {
        guard let firebaseUser else { return nil }
        displayName = firebaseUser.displayName
            ?? firebaseUser.email?.split(separator: "@").first.map(String.init)
            ?? "Account"
        email = firebaseUser.email ?? ""
        photoURL = firebaseUser.photoURL
    }
}

/// Session drawer — modeled on a clean chat-app sidebar: profile + close at the
/// top, one collapsible "Conversations" list of two-line rows (title + date) with
/// long-press menus, and a bottom bar with search / settings / new session.
struct SessionSidebarView: View {
    let projects: [ProjectDoc]
    let sessions: [SessionDoc]
    let selectedSessionId: String?
    let selectedProjectId: String?
    let showUnassignedOnly: Bool
    let user: SidebarUserInfo?
    let onSelectAllProjects: () -> Void
    let onSelectUnassigned: () -> Void
    let onSelectProject: (ProjectDoc) -> Void
    let onCreateProject: () -> Void
    let onEditProject: (ProjectDoc) -> Void
    let onSelect: (SessionDoc) -> Void
    let onCreate: () -> Void
    let onClose: () -> Void
    let onOpenSettings: () -> Void
    let onRename: (SessionDoc, String) -> Void
    let onTogglePin: (SessionDoc) -> Void
    let onMoveToProject: (SessionDoc, String?) -> Void
    let onArchive: (SessionDoc) -> Void
    let onTrash: (SessionDoc) -> Void

    @State private var pinsOpen = true
    @State private var conversationsOpen = true
    @State private var projectsOpen = true
    @State private var searchText = ""
    @State private var renameTarget: SessionDoc?
    @State private var renameText = ""
    @FocusState private var searchFocused: Bool

    private var filteredSessions: [SessionDoc] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return sessions }
        return sessions.filter {
            $0.title.lowercased().contains(query)
                || $0.searchableTextPreview.lowercased().contains(query)
        }
    }

    private func byRecency(_ items: [SessionDoc]) -> [SessionDoc] {
        items.sorted { $0.updatedAt > $1.updatedAt }
    }

    private var pinnedSessions: [SessionDoc] {
        byRecency(filteredSessions.filter(\.pinned))
    }

    private var recentSessions: [SessionDoc] {
        byRecency(filteredSessions.filter { !$0.pinned })
    }

    var body: some View {
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                header
                conversationList
                bottomBar
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(AriaTheme.background)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .alert("Rename session", isPresented: renameBinding) {
            TextField("Session name", text: $renameText)
            Button("Cancel", role: .cancel) { renameTarget = nil }
            Button("Save") {
                if let target = renameTarget { onRename(target, renameText) }
                renameTarget = nil
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            if let user {
                Button {
                    Haptics.tap()
                    onOpenSettings()
                } label: {
                    HStack(spacing: 12) {
                        ProfileAvatar(name: user.displayName, photoURL: user.photoURL, size: 36)
                        Text(user.displayName)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(AriaTheme.foreground)
                            .lineLimit(1)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 8)
            Button {
                Haptics.tap()
                onClose()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(AriaTheme.foregroundMuted)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(AriaTheme.surface))
                    .overlay(Circle().stroke(AriaTheme.borderStrong, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 12)
    }

    // MARK: - Conversation list

    private var conversationList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                sectionHeader("Projects", isOpen: projectsOpen) { projectsOpen.toggle() }
                if projectsOpen {
                    projectRow(title: "All sessions", systemImage: "tray.full", selected: selectedProjectId == nil && !showUnassignedOnly) {
                        onSelectAllProjects()
                    }
                    projectRow(title: "Unassigned", systemImage: "tray", selected: selectedProjectId == nil && showUnassignedOnly) {
                        onSelectUnassigned()
                    }
                    ForEach(projects) { project in
                        projectRow(
                            title: project.name,
                            systemImage: "folder",
                            selected: selectedProjectId == project.id
                        ) {
                            onSelectProject(project)
                        }
                        .contextMenu {
                            Button {
                                onEditProject(project)
                            } label: {
                                Label("Edit project", systemImage: "pencil")
                            }
                        }
                    }
                    Button {
                        Haptics.tap()
                        onCreateProject()
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "plus")
                                .font(.system(size: 12, weight: .semibold))
                            Text("New project")
                                .font(.system(size: 14))
                        }
                        .foregroundStyle(AriaTheme.foregroundMuted)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                }

                if !pinnedSessions.isEmpty {
                    sectionHeader("Pins", isOpen: pinsOpen) { pinsOpen.toggle() }
                    if pinsOpen {
                        ForEach(pinnedSessions) { sessionRow($0) }
                    }
                }

                sectionHeader("Conversations", isOpen: conversationsOpen) { conversationsOpen.toggle() }
                    .padding(.top, pinnedSessions.isEmpty ? 0 : 4)

                if conversationsOpen {
                    if recentSessions.isEmpty {
                        Text(searchText.isEmpty ? "No conversations yet." : "No matches.")
                            .font(.system(size: 14))
                            .foregroundStyle(AriaTheme.foregroundSubtle)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                    } else {
                        ForEach(recentSessions) { sessionRow($0) }
                    }
                }
            }
            .padding(.horizontal, 8)
            .padding(.bottom, 12)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func sectionHeader(_ title: String, isOpen: Bool, toggle: @escaping () -> Void) -> some View {
        Button {
            Haptics.tap()
            withAnimation(.easeInOut(duration: 0.2)) { toggle() }
        } label: {
            HStack {
                Text(title)
                    .font(.system(size: 13))
                    .foregroundStyle(AriaTheme.foregroundMuted)
                Spacer()
                Image(systemName: "chevron.down")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(AriaTheme.foregroundMuted)
                    .rotationEffect(.degrees(isOpen ? 0 : -90))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func projectRow(
        title: String,
        systemImage: String,
        selected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: systemImage)
                    .font(.system(size: 13))
                    .foregroundStyle(AriaTheme.foregroundMuted)
                Text(title)
                    .font(.system(size: 15))
                    .foregroundStyle(selected ? AriaTheme.foreground : AriaTheme.foregroundSecondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(selected ? AriaTheme.surfaceHover : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .contentShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    private func sessionRow(_ session: SessionDoc) -> some View {
        let selected = session.id == selectedSessionId
        let muted = session.status != .active

        return Button {
            Haptics.tap()
            onSelect(session)
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    if session.pinned {
                        Image(systemName: "pin.fill")
                            .font(.system(size: 10))
                            .foregroundStyle(AriaTheme.foregroundMuted)
                    }
                    Text(session.title)
                        .font(.system(size: 15))
                        .foregroundStyle(
                            selected
                                ? AriaTheme.foreground
                                : (muted ? AriaTheme.foregroundMuted : AriaTheme.foregroundSecondary)
                        )
                        .lineLimit(1)
                }
                Text(Self.relativeDate(session.updatedAt))
                    .font(.system(size: 12))
                    .foregroundStyle(AriaTheme.foregroundSubtle)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(selected ? AriaTheme.surfaceHover : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .contentShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                renameText = session.title
                renameTarget = session
            } label: {
                Label("Rename", systemImage: "pencil")
            }
            Button {
                onTogglePin(session)
            } label: {
                Label(session.pinned ? "Unpin" : "Pin", systemImage: session.pinned ? "pin.slash" : "pin")
            }
            Menu("Move to project") {
                Button {
                    onMoveToProject(session, nil)
                } label: {
                    Label("Unassigned", systemImage: "tray")
                }
                ForEach(projects) { project in
                    Button {
                        onMoveToProject(session, project.id)
                    } label: {
                        Label(project.name, systemImage: "folder")
                    }
                }
            }
            if session.status == .active {
                Button {
                    onArchive(session)
                } label: {
                    Label("Archive", systemImage: "archivebox")
                }
            }
            Divider()
            Button(role: .destructive) {
                onTrash(session)
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    // MARK: - Bottom bar

    private var bottomBar: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 14))
                    .foregroundStyle(AriaTheme.foregroundMuted)
                TextField("Search", text: $searchText)
                    .font(.system(size: 15))
                    .foregroundStyle(AriaTheme.foreground)
                    .tint(AriaTheme.foreground)
                    .autocorrectionDisabled()
                    .focused($searchFocused)
                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 15))
                            .foregroundStyle(AriaTheme.foregroundSubtle)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 14)
            .frame(height: 44)
            .background(Capsule().fill(AriaTheme.surface))

            circleButton(systemName: "gearshape") {
                Haptics.tap()
                onOpenSettings()
            }
            circleButton(systemName: "square.and.pencil") {
                Haptics.tap()
                onCreate()
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 6)
    }

    private func circleButton(systemName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 16))
                .foregroundStyle(AriaTheme.foregroundSecondary)
                .frame(width: 44, height: 44)
                .background(Circle().fill(AriaTheme.surface))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Helpers

    private var renameBinding: Binding<Bool> {
        Binding(
            get: { renameTarget != nil },
            set: { if !$0 { renameTarget = nil } }
        )
    }

    private static let isoParsers: [ISO8601DateFormatter] = {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return [withFraction, plain]
    }()

    private static let weekdayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "EEEE"
        return f
    }()

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// Mirrors the reference sidebar: "Today", weekday within the past week,
    /// otherwise an ISO date.
    static func relativeDate(_ iso: String) -> String {
        guard let date = isoParsers.lazy.compactMap({ $0.date(from: iso) }).first else {
            return ""
        }
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        if let days = calendar.dateComponents([.day], from: date, to: Date()).day, days < 7 {
            return weekdayFormatter.string(from: date)
        }
        return dateFormatter.string(from: date)
    }
}
