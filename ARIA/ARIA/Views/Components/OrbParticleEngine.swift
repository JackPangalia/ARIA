import SwiftUI
import simd

/// Persistent particle simulation matching web `OrbParticles.tsx` (Three.js loop).
final class OrbParticleEngine {
    private struct Particle {
        let original: SIMD3<Float>
        var position: SIMD3<Float>
        var velocity: SIMD3<Float>
        let seed: Float
        let mix: Float
    }

    private struct DrawDot {
        var x: CGFloat
        var y: CGFloat
        var size: CGFloat
        var color: Color
        var z: Float
    }

    private static let particleCount = 7200
    private static let radius: Float = 2.0
    private static let white = SIMD3<Float>(1, 1, 1)

    private var particles: [Particle]
    private var currentColor = SIMD3<Float>(0.32, 0.32, 0.36)
    private var targetColor = SIMD3<Float>(0.32, 0.32, 0.36)
    private var smoothEnergy: Float = 0
    var targetEnergy: Float = 0

    private var elapsed: Float = 0
    private var lastDate: Date?
    private var rotationY: Float = 0
    private var drawDots: [DrawDot] = []

    init() {
        let golden = Float.pi * (3 - sqrt(5))
        var pts: [Particle] = []
        pts.reserveCapacity(Self.particleCount)

        for i in 0..<Self.particleCount {
            let y = 1 - (Float(i) / Float(Self.particleCount - 1)) * 2
            let r = sqrt(max(0, 1 - y * y))
            let theta = golden * Float(i)
            let jitter: Float = 0.04
            let x = (cos(theta) * r + Float.random(in: -0.5...0.5) * jitter) * Self.radius
            let py = (y + Float.random(in: -0.5...0.5) * jitter) * Self.radius
            let z = (sin(theta) * r + Float.random(in: -0.5...0.5) * jitter) * Self.radius
            let orig = SIMD3<Float>(x, py, z)
            pts.append(
                Particle(
                    original: orig,
                    position: orig,
                    velocity: .zero,
                    seed: Float.random(in: 0...(Float.pi * 2)),
                    mix: pow(Float.random(in: 0...1), 1.6)
                )
            )
        }
        particles = pts
        drawDots = Array(repeating: DrawDot(x: 0, y: 0, size: 1, color: .white, z: 0), count: Self.particleCount)
    }

    func setTargetColor(_ color: Color) {
        var cr: CGFloat = 0, cg: CGFloat = 0, cb: CGFloat = 0
        UIColor(color).getRed(&cr, green: &cg, blue: &cb, alpha: nil)
        targetColor = SIMD3(Float(cr), Float(cg), Float(cb))
    }

    func step(date: Date, motion: Float) {
        let dt: Float
        if let lastDate {
            dt = min(Float(date.timeIntervalSince(lastDate)), 0.05)
        } else {
            dt = 1.0 / 60.0
        }
        lastDate = date
        elapsed += dt

        currentColor += (targetColor - currentColor) * 0.05

        // Web attack/release — full energy drives color + spin, swell is sublinear for size.
        let reactive = targetEnergy > smoothEnergy ? Float(0.35) : Float(0.12)
        let energyStep = 1 - pow(1 - reactive, dt * 60)
        smoothEnergy += (targetEnergy - smoothEnergy) * energyStep
        let energy = smoothEnergy
        let swell = Self.swellEnergy(from: energy)

        let t = elapsed
        let breathe = 1 + sin(t * 1.4) * (0.03 + swell * 0.09) * motion + swell * 0.12
        let expand = 1 + swell * 0.16
        let wobbleAmount = (0.012 + swell * 0.1) * motion

        for index in particles.indices {
            var particle = particles[index]
            let wobble = sin(t * 1.8 + particle.seed) * wobbleAmount
            let k = expand * (1 + wobble)
            let target = particle.original * k * breathe

            particle.velocity += (target - particle.position) * 0.04
            particle.velocity *= 0.88
            particle.position += particle.velocity
            particles[index] = particle
        }

        rotationY += dt * (0.08 + energy * 0.95) * motion
    }

    func render(context: inout GraphicsContext, size: CGSize, motion: Float) {
        let center = CGPoint(x: size.width / 2, y: size.height / 2)
        // Project using layout extent on the oversized canvas — same as web camera pull-back.
        let layoutExtent = min(size.width, size.height) / AriaTheme.orbCanvasScale
        let scale = layoutExtent * AriaTheme.orbProjectionScale
        let focal = AriaTheme.orbCameraDistance
        let energy = smoothEnergy
        let swell = Self.swellEnergy(from: energy)
        let t = elapsed
        let breathe = 1 + sin(t * 1.4) * (0.03 + swell * 0.09) * motion + swell * 0.12

        let rotX = sin(t * 0.2) * 0.12
        let cosY = cos(rotationY), sinY = sin(rotationY)
        let cosX = cos(rotX), sinX = sin(rotX)

        for index in particles.indices {
            let particle = particles[index]
            let mix = particle.mix

            let pr = (1 - mix) + currentColor.x * mix
            let pg = (1 - mix) + currentColor.y * mix
            let pb = (1 - mix) + currentColor.z * mix
            let alpha = 0.35 + Double(1 - mix) * 0.55
            let dotColor = Color(red: Double(pr), green: Double(pg), blue: Double(pb), opacity: alpha)

            let px = particle.position.x
            let py = particle.position.y
            let pz = particle.position.z

            let rx = px * cosY + pz * sinY
            var ry = py
            var rz = -px * sinY + pz * cosY
            let ry2 = ry * cosX - rz * sinX
            let rz2 = ry * sinX + rz * cosX
            ry = ry2
            rz = rz2

            let perspective: Float = focal / (focal + rz)
            drawDots[index] = DrawDot(
                x: center.x + CGFloat(rx * perspective) * scale,
                y: center.y + CGFloat(ry * perspective) * scale,
                size: max(1.0, CGFloat(2.4 - mix * 1.2) * CGFloat(perspective)),
                color: dotColor,
                z: rz
            )
        }

        drawDots.sort { $0.z < $1.z }

        // Subtle inner glow — matches Three.js core sphere (accent × 0.35, low opacity).
        let coreRadius = scale * 0.35 * CGFloat(breathe)
        let coreRect = CGRect(
            x: center.x - coreRadius,
            y: center.y - coreRadius,
            width: coreRadius * 2,
            height: coreRadius * 2
        )
        let accent = Color(
            red: Double(currentColor.x * 0.35),
            green: Double(currentColor.y * 0.35),
            blue: Double(currentColor.z * 0.35)
        )
        context.fill(
            Path(ellipseIn: coreRect),
            with: .radialGradient(
                Gradient(colors: [
                    Color.white.opacity(0.10),
                    accent.opacity(0.08),
                    Color.clear,
                ]),
                center: center,
                startRadius: 0,
                endRadius: coreRadius
            )
        )

        context.blendMode = .plusLighter

        for dot in drawDots {
            let center = CGPoint(x: dot.x, y: dot.y)
            let radius = dot.size / 2
            let rect = CGRect(
                x: dot.x - radius,
                y: dot.y - radius,
                width: dot.size,
                height: dot.size
            )
            context.fill(
                Path(ellipseIn: rect),
                with: .radialGradient(
                    Gradient(stops: [
                        .init(color: dot.color, location: 0),
                        .init(color: dot.color.opacity(0.55), location: 0.35),
                        .init(color: dot.color.opacity(0.12), location: 0.65),
                        .init(color: .clear, location: 1),
                    ]),
                    center: center,
                    startRadius: 0,
                    endRadius: radius
                )
            )
        }

        context.blendMode = .normal
    }

    /// Maps mic/status energy → size swell. Sublinear so loud peaks feel reactive but stay orb-shaped.
    private static func swellEnergy(from energy: Float) -> Float {
        let clamped = min(max(energy, 0), 1)
        return pow(clamped, 1.25) * 0.62
    }
}
