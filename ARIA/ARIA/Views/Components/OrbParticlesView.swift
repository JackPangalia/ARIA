import SwiftUI

/// SwiftUI Canvas port of web `OrbParticles.tsx` — persistent velocity physics + smooth energy/color.
struct OrbParticlesView: View {
    var color: Color
    var energy: Float

    @State private var engine = OrbParticleEngine()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60.0, paused: false)) { timeline in
            Canvas { context, size in
                let motion: Float = reduceMotion ? 0.2 : 1
                engine.targetEnergy = energy
                engine.setTargetColor(color)
                engine.step(date: timeline.date, motion: motion)
                engine.render(context: &context, size: size, motion: motion)
            }
        }
    }
}
