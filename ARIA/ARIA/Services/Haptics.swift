import UIKit

/// Lightweight wrapper over UIKit feedback generators so the native app feels
/// tactile in ways the web can't — START/STOP taps, wake-word fire, answer ready.
/// There's no public "reduce haptics" flag on iOS, so these are always on; they
/// are cheap and respect the system Haptics master switch automatically.
enum Haptics {
    private static let impactLight = UIImpactFeedbackGenerator(style: .light)
    private static let impactMedium = UIImpactFeedbackGenerator(style: .medium)
    private static let impactRigid = UIImpactFeedbackGenerator(style: .rigid)
    private static let selection = UISelectionFeedbackGenerator()
    private static let notification = UINotificationFeedbackGenerator()

    /// Call before a burst of feedback to cut latency on the first tap.
    static func prepare() {
        impactMedium.prepare()
        notification.prepare()
    }

    /// Light tick for ordinary control taps (menu items, toggles).
    static func tap() {
        selection.selectionChanged()
    }

    /// Firm confirm when the user starts listening.
    static func start() {
        impactMedium.impactOccurred()
    }

    /// Softer release when listening stops.
    static func stop() {
        impactLight.impactOccurred()
    }

    /// Crisp blip when the wake word is detected ("Yes?"). Paired with the wake cue.
    static func wake() {
        impactRigid.impactOccurred(intensity: 0.9)
    }

    /// Gentle tick when the follow-up window opens. Paired with the follow-up cue.
    static func followUp() {
        impactLight.impactOccurred(intensity: 0.6)
    }

    /// Very soft pulse on each "thinking" beat, so the wait is felt as a heartbeat.
    static func thinkingPulse() {
        impactLight.impactOccurred(intensity: 0.35)
    }

    /// Success cue when Kivo begins speaking an answer.
    static func answerReady() {
        notification.notificationOccurred(.success)
    }

    /// Warning cue on errors.
    static func error() {
        notification.notificationOccurred(.error)
    }
}
