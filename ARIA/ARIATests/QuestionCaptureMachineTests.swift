import Foundation
import Testing
@testable import ARIA

@MainActor
struct QuestionCaptureMachineTests {
    @Test func resolvesQuestionAfterWake() async {
        let machine = QuestionCaptureMachine(
            questionSettleMs: 50,
            speechFinalSettleMs: 50,
            followUpWindowMs: 100
        )

        var resolved: CapturedQuestion?
        machine.onResolveQuestion = { resolved = $0 }

        machine.handleUtterance(
            TranscriptUtterance(
                id: "u1",
                speaker: 0,
                speakerName: "Alex",
                providerSpeakerLabel: "S1",
                text: "Hey Kivo, what is the launch date?",
                start: 0,
                end: 1,
                isFinal: true,
                speechFinal: true
            )
        )

        try? await Task.sleep(nanoseconds: 120_000_000)
        #expect(resolved?.question.contains("launch date") == true)
        #expect(resolved?.speakerName == "Alex")
    }

    @Test func followUpWindowAcceptsSpeechWithoutWake() async {
        let machine = QuestionCaptureMachine(
            questionSettleMs: 50,
            speechFinalSettleMs: 50,
            followUpWindowMs: 500
        )

        var resolved: CapturedQuestion?
        machine.onResolveQuestion = { resolved = $0 }

        machine.startFollowUpWindow()
        machine.handleUtterance(
            TranscriptUtterance(
                id: "u2",
                speaker: 0,
                speakerName: nil,
                providerSpeakerLabel: "S1",
                text: "And what about marketing?",
                start: 2,
                end: 3,
                isFinal: true,
                speechFinal: true
            )
        )

        try? await Task.sleep(nanoseconds: 120_000_000)
        #expect(resolved?.question.contains("marketing") == true)
    }
}
