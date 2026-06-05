import Combine
import Foundation

@MainActor
final class AppWorkspaceViewModel: ObservableObject {
    @Published var sessions: [SessionDoc] = []
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
            let session = try await APIClient.shared.createSession(CreateSessionRequest())
            sessions.insert(session, at: 0)
            await selectSession(session)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func ensureSession() async throws -> String {
        if let selectedSessionId { return selectedSessionId }
        let session = try await APIClient.shared.createSession(CreateSessionRequest())
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
