import SwiftUI
import UIKit

/// Main in-person workspace — matches web `SessionWorkspace.tsx` mobile layout.
struct AppWorkspaceView: View {
    @StateObject private var viewModel = AppWorkspaceViewModel()
    @ObservedObject private var auth = AuthService.shared
    @EnvironmentObject private var theme: ThemeStore
    @State private var showSettings = false
    @State private var projectEditor: ProjectEditorDraft?

    var body: some View {
        ZStack {
            AriaTheme.background.ignoresSafeArea()

            if viewModel.isLoading {
                ProgressView()
                    .tint(AriaTheme.foreground)
            } else {
                workspaceContent
                    .gesture(DragGesture(minimumDistance: 20).onEnded(handleWorkspaceDrag))
            }

            if viewModel.sidebarOpen {
                AriaTheme.overlay.ignoresSafeArea()
                    .transition(.opacity)
                    .onTapGesture {
                        Haptics.tap()
                        closeSidebar()
                    }

                SessionSidebarView(
                    projects: viewModel.projects,
                    sessions: viewModel.sessions,
                    selectedSessionId: viewModel.selectedSessionId,
                    selectedProjectId: viewModel.selectedProjectId,
                    showUnassignedOnly: viewModel.showUnassignedOnly,
                    user: SidebarUserInfo(firebaseUser: auth.user),
                    onSelectAllProjects: { Task { await viewModel.selectAllProjects() } },
                    onSelectUnassigned: { Task { await viewModel.selectUnassigned() } },
                    onSelectProject: { project in Task { await viewModel.selectProject(project) } },
                    onCreateProject: { projectEditor = .create },
                    onEditProject: { project in projectEditor = .edit(project) },
                    onSelect: { session in Task { await viewModel.selectSession(session) } },
                    onCreate: { Task { await viewModel.createSession() } },
                    onClose: { closeSidebar() },
                    onOpenSettings: {
                        closeSidebar()
                        showSettings = true
                    },
                    onRename: { session, title in Task { await viewModel.renameSession(session, to: title) } },
                    onTogglePin: { session in Task { await viewModel.togglePin(session) } },
                    onMoveToProject: { session, projectId in Task { await viewModel.moveSession(session, to: projectId) } },
                    onArchive: { session in Task { await viewModel.archiveSession(session) } },
                    onTrash: { session in Task { await viewModel.trashSession(session) } }
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .transition(.move(edge: .leading))
                .gesture(
                    DragGesture(minimumDistance: 20).onEnded { value in
                        if value.translation.width < -55 {
                            Haptics.tap()
                            closeSidebar()
                        }
                    }
                )
            }

            if viewModel.transcriptOpen, let detail = viewModel.detail {
                TranscriptPanelView(turns: detail.turns) {
                    Haptics.tap()
                    viewModel.transcriptOpen = false
                }
                .transition(.move(edge: .trailing).combined(with: .opacity))
                .zIndex(40)
                .gesture(
                    DragGesture(minimumDistance: 20).onEnded { value in
                        if value.translation.width > 55 {
                            Haptics.tap()
                            viewModel.transcriptOpen = false
                        }
                    }
                )
            }
        }
        .preferredColorScheme(theme.colorScheme)
        .animation(.spring(response: 0.38, dampingFraction: 0.9), value: viewModel.sidebarOpen)
        .animation(.easeInOut(duration: 0.28), value: viewModel.transcriptOpen)
        .task {
            Haptics.prepare()
            await viewModel.bootstrap()
        }
        .onDisappear { Task { await viewModel.stopEngineOnDisappear() } }
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
        .sheet(item: $projectEditor) { draft in
            ProjectEditorSheet(draft: draft) { name, instructions in
                switch draft.mode {
                case .create:
                    Task { await viewModel.createProject(name: name, instructions: instructions) }
                case .edit(let project):
                    Task { await viewModel.updateProject(project, name: name, instructions: instructions) }
                }
                projectEditor = nil
            } onArchive: { project in
                Task { await viewModel.archiveProject(project) }
                projectEditor = nil
            }
        }
        .alert("Error", isPresented: .constant(viewModel.errorMessage != nil)) {
            Button("OK") { viewModel.errorMessage = nil }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
    }

    @ViewBuilder
    private var workspaceContent: some View {
        ZStack {
            VStack {
                HStack(spacing: 2) {
                    Button {
                        Haptics.tap()
                        viewModel.sidebarOpen = true
                    } label: {
                        topBarIcon("sidebar.left")
                    }
                    Button {
                        Haptics.tap()
                        Task { await viewModel.createSession() }
                    } label: {
                        topBarIcon("square.and.pencil")
                    }
                    Spacer()
                    if viewModel.hasSession && !viewModel.transcriptOpen {
                        Button {
                            Haptics.tap()
                            viewModel.transcriptOpen = true
                        } label: {
                            topBarIcon("text.alignleft")
                        }
                        .transition(.opacity.combined(with: .scale(scale: 0.8)))
                    }
                }
                .padding(.horizontal, 12)
                .padding(.top, 8)
                Spacer()
            }
            .zIndex(10)

            if let engine = viewModel.engine {
                LiveWorkspaceColumn(
                    engine: engine,
                    sessionTitle: viewModel.detail?.session.title,
                    resume: (viewModel.detail?.session.turnCount ?? 0) > 0,
                    archived: viewModel.detail?.session.status == .archived,
                    isRunning: viewModel.isRunning,
                    controlsBusy: viewModel.controlsBusy,
                    onStart: {
                        Haptics.start()
                        Task { await viewModel.startListening() }
                    },
                    onStop: {
                        Haptics.stop()
                        Task { await viewModel.stopListening() }
                    }
                )
            } else {
                IdleWorkspaceColumn(
                    controlsBusy: viewModel.controlsBusy,
                    onStart: {
                        Haptics.start()
                        Task { await viewModel.startListening() }
                    }
                )
            }
        }
    }

    private func closeSidebar() {
        viewModel.sidebarOpen = false
    }

    private func topBarIcon(_ systemName: String) -> some View {
        Image(systemName: systemName)
            .font(.system(size: 18))
            .foregroundStyle(AriaTheme.foregroundMuted)
            .frame(width: 40, height: 40)
            .contentShape(Rectangle())
    }

    private func handleWorkspaceDrag(_ value: DragGesture.Value) {
        let dx = value.translation.width
        let startX = value.startLocation.x
        let width = UIScreen.main.bounds.width
        let threshold: CGFloat = 55
        guard abs(dx) > threshold, abs(dx) > abs(value.translation.height) else { return }

        if dx > 0 {
            // Swipe right: close transcript, else open sidebar from the left edge.
            if viewModel.transcriptOpen {
                Haptics.tap()
                viewModel.transcriptOpen = false
            } else if startX < 60 {
                Haptics.tap()
                viewModel.sidebarOpen = true
            }
        } else if viewModel.hasSession, startX > width - 60 {
            // Swipe left from the right edge: open transcript.
            Haptics.tap()
            viewModel.transcriptOpen = true
        }
    }
}

private struct LiveWorkspaceColumn: View {
    @ObservedObject var engine: AriaEngine
    let sessionTitle: String?
    let resume: Bool
    let archived: Bool
    let isRunning: Bool
    let controlsBusy: Bool
    let onStart: () -> Void
    let onStop: () -> Void

    var body: some View {
        VStack(spacing: 28) {
            VStack(spacing: 0) {
                Text("KIVO")
                    .font(.system(size: 10, weight: .regular))
                    .tracking(6.5)
                    .foregroundStyle(AriaTheme.foregroundSubtle)
                    .padding(.bottom, 32)
                OrbVisualizerView(
                    status: engine.status,
                    micLevel: engine.micLevel,
                    sessionTitle: sessionTitle,
                    resume: resume,
                    errorMessage: engine.errorMessage
                )
            }
            ControlsView(
                isRunning: isRunning,
                resume: resume,
                disabled: archived,
                busy: controlsBusy,
                onStart: onStart,
                onStop: onStop
            )
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct IdleWorkspaceColumn: View {
    let controlsBusy: Bool
    let onStart: () -> Void

    var body: some View {
        VStack(spacing: 28) {
            VStack(spacing: 0) {
                Text("KIVO")
                    .font(.system(size: 10, weight: .regular))
                    .tracking(6.5)
                    .foregroundStyle(AriaTheme.foregroundSubtle)
                    .padding(.bottom, 32)
                OrbVisualizerView(
                    status: .idle,
                    micLevel: 0,
                    sessionTitle: nil,
                    resume: false,
                    errorMessage: nil
                )
            }
            ControlsView(
                isRunning: false,
                resume: false,
                disabled: false,
                busy: controlsBusy,
                onStart: onStart,
                onStop: {}
            )
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct ProjectEditorDraft: Identifiable {
    enum Mode {
        case create
        case edit(ProjectDoc)
    }

    let id = UUID()
    let mode: Mode

    static var create: ProjectEditorDraft {
        ProjectEditorDraft(mode: .create)
    }

    static func edit(_ project: ProjectDoc) -> ProjectEditorDraft {
        ProjectEditorDraft(mode: .edit(project))
    }
}

private struct ProjectEditorSheet: View {
    let draft: ProjectEditorDraft
    let onSave: (String, String) -> Void
    let onArchive: (ProjectDoc) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var instructions: String

    init(
        draft: ProjectEditorDraft,
        onSave: @escaping (String, String) -> Void,
        onArchive: @escaping (ProjectDoc) -> Void
    ) {
        self.draft = draft
        self.onSave = onSave
        self.onArchive = onArchive
        switch draft.mode {
        case .create:
            _name = State(initialValue: "")
            _instructions = State(initialValue: "")
        case .edit(let project):
            _name = State(initialValue: project.name)
            _instructions = State(initialValue: project.instructions)
        }
    }

    private var title: String {
        switch draft.mode {
        case .create: return "New project"
        case .edit: return "Edit project"
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Project") {
                    TextField("Name", text: $name)
                        .textInputAutocapitalization(.words)
                    TextEditor(text: $instructions)
                        .frame(minHeight: 140)
                }
                Section {
                    Text("Instructions are included whenever Kivo answers inside sessions assigned to this project.")
                        .font(.footnote)
                        .foregroundStyle(AriaTheme.foregroundMuted)
                }
                if case .edit(let project) = draft.mode {
                    Section {
                        Button("Archive project", role: .destructive) {
                            onArchive(project)
                            dismiss()
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(AriaTheme.background)
            .navigationTitle(title)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(name, instructions)
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
