import Combine
import Foundation

@MainActor
final class AppWorkspaceViewModel: ObservableObject {
    @Published var projects: [ProjectDoc] = []
    @Published var sessions: [SessionDoc] = []
    @Published var selectedProjectId: String?
    @Published var showUnassignedOnly = false
    @Published var selectedSessionId: String?
    @Published var detail: SessionDetailResponse?
    @Published var usage: UsageSummary?
    @Published var errorMessage: String?
    @Published var isLoading = true
    @Published var sidebarOpen = false
    @Published var transcriptOpen = false
    @Published var settingsOpen = false
    @Published var controlsBusy = false

    @Published var engine: AriaEngine?
    private var usageRefreshTask: Task<Void, Never>?

    var hasSession: Bool {
        selectedSessionId != nil && detail != nil
    }

    var isRunning: Bool {
        guard let engine else { return false }
        return engine.status != .idle && engine.status != .error
    }

    func bootstrap() async {
        isLoading = true
        defer { isLoading = false }
        do {
            projects = try await APIClient.shared.listProjects()
            sessions = try await APIClient.shared.listSessions(limit: 50)
            if let first = sessions.first {
                await selectSession(first)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        startUsageRefreshLoop()
    }

    func selectSession(_ session: SessionDoc) async {
        sidebarOpen = false
        transcriptOpen = false
        if isRunning {
            await engine?.stop()
        }
        selectedSessionId = session.id
        engine = AriaEngine(sessionId: session.id)
        wireEngine()
        await refreshDetail()
        await refreshUsage()
    }

    func createSession() async {
        do {
            let session = try await APIClient.shared.createSession(
                CreateSessionRequest(projectId: selectedProjectId)
            )
            sessions.insert(session, at: 0)
            await selectSession(session)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func ensureSession() async throws -> String {
        if let selectedSessionId { return selectedSessionId }
        let session = try await APIClient.shared.createSession(
            CreateSessionRequest(projectId: selectedProjectId)
        )
        sessions.insert(session, at: 0)
        await selectSession(session)
        return session.id
    }

    // MARK: - Session actions (parity with web sidebar row menu)

    func renameSession(_ session: SessionDoc, to title: String) async {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != session.title else { return }
        do {
            let updated = try await APIClient.shared.patchSession(session.id, title: trimmed)
            apply(updated)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func togglePin(_ session: SessionDoc) async {
        do {
            let updated = try await APIClient.shared.patchSession(session.id, pinned: !session.pinned)
            apply(updated)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func archiveSession(_ session: SessionDoc) async {
        do {
            let updated = try await APIClient.shared.patchSession(session.id, status: .archived)
            apply(updated)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func trashSession(_ session: SessionDoc) async {
        do {
            _ = try await APIClient.shared.patchSession(session.id, status: .trashed)
            sessions.removeAll { $0.id == session.id }
            if selectedSessionId == session.id {
                if isRunning { await engine?.stop() }
                selectedSessionId = nil
                detail = nil
                engine = nil
                if let next = sessions.first {
                    await selectSession(next)
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Project actions

    var projectFilterLabel: String {
        if let selectedProjectId,
           let project = projects.first(where: { $0.id == selectedProjectId }) {
            return project.name
        }
        return showUnassignedOnly ? "Unassigned" : "All sessions"
    }

    func selectAllProjects() async {
        selectedProjectId = nil
        showUnassignedOnly = false
        await reloadSessionsForCurrentProject()
    }

    func selectUnassigned() async {
        selectedProjectId = nil
        showUnassignedOnly = true
        await reloadSessionsForCurrentProject()
    }

    func selectProject(_ project: ProjectDoc) async {
        selectedProjectId = project.id
        showUnassignedOnly = false
        await reloadSessionsForCurrentProject()
    }

    func createProject(name: String, instructions: String) async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            let project = try await APIClient.shared.createProject(
                CreateProjectRequest(name: trimmed, instructions: instructions)
            )
            projects.insert(project, at: 0)
            selectedProjectId = project.id
            showUnassignedOnly = false
            await reloadSessionsForCurrentProject()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateProject(_ project: ProjectDoc, name: String, instructions: String) async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            let updated = try await APIClient.shared.patchProject(
                project.id,
                PatchProjectRequest(name: trimmed, instructions: instructions)
            )
            if let index = projects.firstIndex(where: { $0.id == updated.id }) {
                projects[index] = updated
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func archiveProject(_ project: ProjectDoc) async {
        do {
            try await APIClient.shared.archiveProject(project.id)
            projects.removeAll { $0.id == project.id }
            if selectedProjectId == project.id {
                selectedProjectId = nil
                showUnassignedOnly = false
            }
            await reloadSessionsForCurrentProject()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func moveSession(_ session: SessionDoc, to projectId: String?) async {
        do {
            let updated = try await APIClient.shared.patchSession(
                session.id,
                projectId: .some(projectId)
            )
            apply(updated)
            await reloadSessionsForCurrentProject()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func reloadSessionsForCurrentProject() async {
        do {
            sessions = try await APIClient.shared.listSessions(
                limit: 50,
                projectId: selectedProjectId,
                unassigned: showUnassignedOnly
            )
            if let selectedSessionId,
               !sessions.contains(where: { $0.id == selectedSessionId }) {
                if isRunning { await engine?.stop() }
                self.selectedSessionId = nil
                detail = nil
                engine = nil
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Replaces the session in the list (and detail) with a server-updated copy,
    /// re-sorting so pins float to the top — mirrors the web repository ordering.
    private func apply(_ updated: SessionDoc) {
        if let index = sessions.firstIndex(where: { $0.id == updated.id }) {
            sessions[index] = updated
        }
        sessions.sort { lhs, rhs in
            if lhs.pinned != rhs.pinned { return lhs.pinned }
            return lhs.updatedAt > rhs.updatedAt
        }
        if selectedSessionId == updated.id, var detail {
            detail.session = updated
            self.detail = detail
        }
    }

    func refreshDetail() async {
        guard let selectedSessionId else { return }
        do {
            detail = try await APIClient.shared.getSessionDetail(selectedSessionId)
            if let index = sessions.firstIndex(where: { $0.id == selectedSessionId }),
               let detail {
                sessions[index] = detail.session
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refreshUsage() async {
        do {
            usage = try await APIClient.shared.getUsage()
        } catch {
            // Best-effort meter.
        }
    }

    func startListening() async {
        guard !controlsBusy else { return }
        controlsBusy = true
        defer { controlsBusy = false }
        do {
            _ = try await ensureSession()
            guard let engine else { return }
            await engine.start()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func stopListening() async {
        guard !controlsBusy else { return }
        controlsBusy = true
        defer { controlsBusy = false }
        await engine?.stop()
        await refreshDetail()
        await refreshUsage()
    }

    func stopEngineOnDisappear() async {
        await engine?.stop()
        usageRefreshTask?.cancel()
    }

    private func wireEngine() {
        engine?.onSessionActivity = { [weak self] in
            Task { await self?.refreshDetail() }
        }
        engine?.onUsageExhausted = { [weak self] in
            Task { await self?.refreshUsage() }
        }
    }

    private func startUsageRefreshLoop() {
        usageRefreshTask?.cancel()
        usageRefreshTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refreshUsage()
                try? await Task.sleep(nanoseconds: 20_000_000_000)
            }
        }
    }
}
