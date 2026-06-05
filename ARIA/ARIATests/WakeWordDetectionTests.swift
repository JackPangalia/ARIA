import Foundation
import Testing
@testable import ARIA

struct WakeWordDetectionTests {
    @Test func detectsHeyKivoWithQuestion() {
        let result = WakeWordDetection.extractQuestionAfterWake(from: "Hey Kivo, what did we decide about pricing?")
        #expect(result.detected)
        #expect(result.question == "what did we decide about pricing?")
    }

    @Test func detectsStandaloneKivo() {
        let result = WakeWordDetection.extractQuestionAfterWake(from: "Kivo summarize the last five minutes")
        #expect(result.detected)
        #expect(result.question == "summarize the last five minutes")
    }

    @Test func ignoresUnrelatedSpeech() {
        let result = WakeWordDetection.extractQuestionAfterWake(from: "We should review the roadmap tomorrow.")
        #expect(!result.detected)
        #expect(result.question.isEmpty)
    }

    @Test func substantiveQuestionRequiresContent() {
        #expect(!WakeWordDetection.isSubstantiveQuestion(""))
        #expect(!WakeWordDetection.isSubstantiveQuestion("  "))
        #expect(WakeWordDetection.isSubstantiveQuestion("Why?"))
    }

    @Test func joinTextPreservesWords() {
        let joined = WakeWordDetection.joinText("What is", "the budget")
        #expect(joined == "What is the budget")
    }
}
