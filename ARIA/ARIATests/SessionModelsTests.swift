import Foundation
import Testing
@testable import ARIA

struct SessionModelsTests {
    @Test func decodesSessionDoc() throws {
        let json = """
        {
          "id": "sess_1",
          "title": "Product sync",
          "projectId": "proj_1",
          "autoTitled": false,
          "status": "active",
          "speakerCount": 2,
          "pinned": false,
          "createdAt": "2026-06-01T12:00:00.000Z",
          "updatedAt": "2026-06-01T12:05:00.000Z",
          "endedAt": null,
          "trashedAt": null,
          "lastSummaryAt": null,
          "tokenEstimate": 120,
          "searchableTextPreview": "Roadmap discussion",
          "turnCount": 3,
          "mode": "in_person",
          "botId": null
        }
        """.data(using: .utf8)!

        let session = try JSONDecoder().decode(SessionDoc.self, from: json)
        #expect(session.id == "sess_1")
        #expect(session.title == "Product sync")
        #expect(session.projectId == "proj_1")
        #expect(session.status == .active)
    }

    @Test func decodesProjectDoc() throws {
        let json = """
        {
          "id": "proj_1",
          "name": "Launch",
          "instructions": "Answer with launch context.",
          "status": "active",
          "createdAt": "2026-06-01T12:00:00.000Z",
          "updatedAt": "2026-06-01T12:05:00.000Z",
          "archivedAt": null
        }
        """.data(using: .utf8)!

        let project = try JSONDecoder().decode(ProjectDoc.self, from: json)
        #expect(project.id == "proj_1")
        #expect(project.name == "Launch")
        #expect(project.status == .active)
    }

    @Test func decodesUsageSummary() throws {
        let json = """
        {
          "tier": "free",
          "periodKey": "2026-06",
          "listening": {
            "usedSeconds": 120,
            "capSeconds": 3600,
            "remainingSeconds": 3480,
            "pct": 0.03,
            "exhausted": false
          },
          "asks": {
            "usedTokens": 1000,
            "capTokens": 50000,
            "pct": 0.02,
            "exhausted": false
          }
        }
        """.data(using: .utf8)!

        let usage = try JSONDecoder().decode(UsageSummary.self, from: json)
        #expect(usage.tier == .free)
        #expect(usage.listening.remainingSeconds == 3480)
    }
}
