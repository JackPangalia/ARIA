import Foundation

enum APIClientError: LocalizedError {
    case unauthorized
    case invalidURL
    case server(status: Int, message: String)
    case decoding(Error)
    case noData

    var errorDescription: String? {
        switch self {
        case .unauthorized:
            return "You must be signed in."
        case .invalidURL:
            return "Invalid API URL."
        case .server(_, let message):
            return message
        case .decoding(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        case .noData:
            return "No response data."
        }
    }
}

@MainActor
final class APIClient {
    static let shared = APIClient()

    var tokenProvider: (() async throws -> String)?

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(session: URLSession = .shared) {
        self.session = session
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }

    func url(for path: String) -> URL? {
        let normalized = path.hasPrefix("/") ? path : "/\(path)"
        guard var components = URLComponents(url: AppConfig.apiBaseURL, resolvingAgainstBaseURL: true) else {
            return nil
        }
        let split = normalized.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        components.path = String(split[0])
        if split.count > 1 {
            components.percentEncodedQuery = String(split[1])
        }
        return components.url
    }

    func request<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: (any Encodable)? = nil
    ) async throws -> T {
        guard let url = url(for: path) else { throw APIClientError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let tokenProvider {
            let token = try await tokenProvider()
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }

        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIClientError.decoding(error)
        }
    }

    func requestVoid(
        _ path: String,
        method: String = "POST",
        body: (any Encodable)? = nil
    ) async throws {
        guard let url = url(for: path) else { throw APIClientError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let tokenProvider {
            let token = try await tokenProvider()
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
    }

    func requestData(
        _ path: String,
        method: String = "POST",
        body: (any Encodable)? = nil
    ) async throws -> Data {
        guard let url = url(for: path) else { throw APIClientError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let tokenProvider {
            let token = try await tokenProvider()
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        return data
    }

    func requestBinary(
        _ path: String,
        method: String = "POST",
        body: (any Encodable)? = nil
    ) async throws -> (Data, HTTPURLResponse) {
        guard let url = url(for: path) else { throw APIClientError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("audio/mpeg", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let tokenProvider {
            let token = try await tokenProvider()
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIClientError.noData }
        if http.statusCode == 401 { throw APIClientError.unauthorized }
        if !(200...299).contains(http.statusCode) {
            let message = (try? decoder.decode(APIErrorResponse.self, from: data))?.error
                ?? "Request failed (\(http.statusCode))"
            throw APIClientError.server(status: http.statusCode, message: message)
        }
        return (data, http)
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw APIClientError.noData }
        if http.statusCode == 401 { throw APIClientError.unauthorized }
        guard (200...299).contains(http.statusCode) else {
            let message = (try? decoder.decode(APIErrorResponse.self, from: data))?.error
                ?? "Request failed (\(http.statusCode))"
            throw APIClientError.server(status: http.statusCode, message: message)
        }
    }
}

private struct AnyEncodable: Encodable {
    private let encodeClosure: (Encoder) throws -> Void

    init(_ wrapped: any Encodable) {
        encodeClosure = wrapped.encode
    }

    func encode(to encoder: Encoder) throws {
        try encodeClosure(encoder)
    }
}

// MARK: - Session API

extension APIClient {
    func createSession(_ input: CreateSessionRequest) async throws -> SessionDoc {
        try await request("/api/sessions", method: "POST", body: input)
    }

    func listSessions(
        q: String? = nil,
        limit: Int = 30,
        projectId: String? = nil,
        unassigned: Bool = false
    ) async throws -> [SessionDoc] {
        var path = "/api/sessions?limit=\(limit)"
        if let q, !q.isEmpty {
            path += "&q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q)"
        }
        if let projectId, !projectId.isEmpty {
            path += "&projectId=\(projectId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? projectId)"
        } else if unassigned {
            path += "&unassigned=true"
        }
        let response: SessionsListResponse = try await request(path)
        return response.sessions
    }

    func getSessionDetail(_ sessionId: String) async throws -> SessionDetailResponse {
        try await request("/api/sessions/\(sessionId)")
    }

    func listProjects() async throws -> [ProjectDoc] {
        let response: ProjectsListResponse = try await request("/api/projects")
        return response.projects
    }

    func createProject(_ input: CreateProjectRequest) async throws -> ProjectDoc {
        try await request("/api/projects", method: "POST", body: input)
    }

    func patchProject(_ projectId: String, _ input: PatchProjectRequest) async throws -> ProjectDoc {
        try await request("/api/projects/\(projectId)", method: "PATCH", body: input)
    }

    func archiveProject(_ projectId: String) async throws {
        try await requestVoid("/api/projects/\(projectId)", method: "DELETE")
    }

    func patchSession(
        _ sessionId: String,
        title: String? = nil,
        status: SessionStatus? = nil,
        pinned: Bool? = nil,
        projectId: String?? = nil
    ) async throws -> SessionDoc {
        struct Patch: Encodable {
            var title: String?
            var status: SessionStatus?
            var pinned: Bool?
            var projectId: String??

            enum CodingKeys: String, CodingKey {
                case title, status, pinned, projectId
            }

            func encode(to encoder: Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                try container.encodeIfPresent(title, forKey: .title)
                try container.encodeIfPresent(status, forKey: .status)
                try container.encodeIfPresent(pinned, forKey: .pinned)
                if let projectId {
                    try container.encode(projectId, forKey: .projectId)
                }
            }
        }
        return try await request(
            "/api/sessions/\(sessionId)",
            method: "PATCH",
            body: Patch(title: title, status: status, pinned: pinned, projectId: projectId)
        )
    }

    func listTrashedSessions(limit: Int = 100) async throws -> [SessionDoc] {
        let response: SessionsListResponse = try await request("/api/sessions?status=trashed&limit=\(limit)")
        return response.sessions
    }

    func deleteSession(_ sessionId: String) async throws {
        try await requestVoid("/api/sessions/\(sessionId)", method: "DELETE")
    }

    func appendTurn(_ sessionId: String, turn: CreateTurnRequest) async throws -> TurnDoc {
        try await request("/api/sessions/\(sessionId)/turns", method: "POST", body: turn)
    }

    func prefetchContext(_ sessionId: String, question: String) async throws {
        try await requestVoid(
            "/api/sessions/\(sessionId)/prefetch-context",
            method: "POST",
            body: PrefetchContextRequest(question: question)
        )
    }

    /// Regenerate the session title from the whole conversation once it ends.
    func finalizeTitle(_ sessionId: String) async throws {
        try await requestVoid("/api/sessions/\(sessionId)/finalize-title", method: "POST")
    }

    func ask(_ requestBody: AskRequest) async throws -> Data {
        let (data, _) = try await requestBinary("/api/ask", method: "POST", body: requestBody)
        return data
    }

    /// Streaming answer: requests framed MP3 segments (`X-Kivo-Stream: framed`) and
    /// yields response chunks as they arrive, so playback can start on the first
    /// sentence instead of buffering the whole answer.
    func askStreaming(_ requestBody: AskRequest) async throws -> AsyncThrowingStream<Data, Error> {
        guard let url = url(for: "/api/ask") else { throw APIClientError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("framed", forHTTPHeaderField: "X-Kivo-Stream")
        request.setValue("application/x-kivo-audio-frames", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let tokenProvider {
            let token = try await tokenProvider()
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = try encoder.encode(AnyEncodable(requestBody))
        return StreamingResponse().stream(for: request)
    }

    func getSpeechmaticsToken() async throws -> SpeechmaticsTokenResponse {
        try await request("/api/speechmatics/token", method: "POST")
    }

    func listSpeakerProfiles() async throws -> [SpeakerProfileDoc] {
        let response: SpeakerProfilesResponse = try await request("/api/speaker-profiles")
        return response.profiles
    }

    func saveSpeakerProfile(_ input: SaveSpeakerProfileRequest) async throws -> SpeakerProfileDoc {
        try await request("/api/speaker-profiles", method: "POST", body: input)
    }

    func patchSpeakerProfile(_ profileId: String, _ input: PatchSpeakerProfileRequest) async throws -> SpeakerProfileDoc {
        try await request("/api/speaker-profiles/\(profileId)", method: "PATCH", body: input)
    }

    func deleteSpeakerProfile(_ profileId: String) async throws {
        try await requestVoid("/api/speaker-profiles/\(profileId)", method: "DELETE")
    }

    func getUsage() async throws -> UsageSummary {
        try await request("/api/usage")
    }

    func sendHeartbeat(sessionId: String) async throws -> HeartbeatResponse {
        try await request("/api/usage/heartbeat", method: "POST", body: HeartbeatRequest(sessionId: sessionId))
    }

    func deleteAccount() async throws {
        struct DeleteResponse: Decodable { let ok: Bool }
        let _: DeleteResponse = try await request("/api/account/delete", method: "POST")
    }

    // MARK: - Billing

    /// Returns a Stripe billing-portal URL to open in an in-app Safari sheet.
    func billingPortalURL() async throws -> URL {
        let response: BillingPortalResponse = try await request("/api/billing/portal", method: "POST")
        guard let url = URL(string: response.url) else { throw APIClientError.invalidURL }
        return url
    }

    // MARK: - Connectors

    func listConnections() async throws -> [ConnectionSummary] {
        let response: ConnectionsResponse = try await request("/api/composio/connections")
        return response.connections
    }

    /// Starts an OAuth connection; returns a redirect URL to open in Safari.
    func initiateConnection(toolkit: String) async throws -> URL? {
        let response: InitiateConnectionResponse = try await request(
            "/api/composio/connections",
            method: "POST",
            body: InitiateConnectionRequest(toolkit: toolkit)
        )
        return response.redirectUrl.flatMap(URL.init(string:))
    }

    func deleteConnection(id: String) async throws {
        try await requestVoid("/api/composio/connections?id=\(id)", method: "DELETE")
    }
}
