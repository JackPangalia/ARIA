"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * The Kivo orb, rendered as a Three.js particle sphere — the same look as the
 * marketing hero (`LandingOrb`), but driven by the in-app state machine instead
 * of the mouse:
 *   - `color`  the current mode's accent (tweened smoothly between states)
 *   - `energy` 0..1 drives breathing amplitude, spin speed, and turbulence
 *              (fed by mic level while listening, fixed levels while thinking /
 *              speaking, 0 when idle)
 *
 * Color/energy are read through refs so prop changes never re-create the scene;
 * the scene is only rebuilt when the theme flips (light vs dark changes the
 * blend mode).
 */
export function OrbParticles({
  color,
  energy,
  isLight,
  className,
  particleCount = 13000,
  particleSize = 0.052,
  colorMixPower = 1.6,
  cameraZ = 6.7,
}: {
  color: string;
  energy: number;
  isLight: boolean;
  className?: string;
  /** Lower for small render targets (e.g. the floating widget) to cut per-frame CPU cost. */
  particleCount?: number;
  /**
   * Particle radius in world units. Because `sizeAttenuation` is on, a particle's
   * on-screen size scales with the canvas, so a small canvas needs a larger value
   * to keep the field looking like the same orb rather than finer dust.
   */
  particleSize?: number;
  /**
   * Exponent on each particle's white→accent blend position. The default skews
   * most particles toward the white core; values below 1 push more of them into
   * the accent, so the current mode's color still reads on a small canvas where
   * there's less overlap to accumulate it.
   */
  colorMixPower?: number;
  /**
   * Camera distance. The default keeps the resting orb large in-app with just
   * enough margin for loud-state expansion. Pull it back to shrink the whole
   * field relative to the canvas — the floating widget needs the extra headroom
   * because its window edge is a hard clip with no mask fade past it.
   */
  cameraZ?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const energyRef = useRef(energy);
  const colorRef = useRef(color);
  energyRef.current = energy;
  colorRef.current = color;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const motion = reduceMotion ? 0.2 : 1;

    const N = particleCount;
    const RADIUS = 2.0;

    const host = canvas;
    let W = host.clientWidth || 288;
    let H = host.clientHeight || 288;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
    // Pulled back to match the canvas being ~1.4x its layout box (see
    // OrbVisualizer): keeps the resting orb the same on-screen size while
    // leaving margin so loud-state expansion isn't clipped at the frustum edge.
    camera.position.z = cameraZ;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(W, H, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));

    function makeSprite() {
      const s = 128;
      const c = document.createElement("canvas");
      c.width = s;
      c.height = s;
      const ctx = c.getContext("2d");
      if (!ctx) return new THREE.CanvasTexture(c);
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.25, "rgba(255,255,255,0.85)");
      g.addColorStop(0.6, "rgba(255,255,255,0.18)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      const tex = new THREE.CanvasTexture(c);
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      return tex;
    }
    const sprite = makeSprite();

    const positions = new Float32Array(N * 3);
    const original = new Float32Array(N * 3);
    const velocities = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const seeds = new Float32Array(N);
    const mix = new Float32Array(N);

    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = golden * i;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      const jitter = 0.04;
      const px = (x + (Math.random() - 0.5) * jitter) * RADIUS;
      const py = (y + (Math.random() - 0.5) * jitter) * RADIUS;
      const pz = (z + (Math.random() - 0.5) * jitter) * RADIUS;
      positions[i * 3] = original[i * 3] = px;
      positions[i * 3 + 1] = original[i * 3 + 1] = py;
      positions[i * 3 + 2] = original[i * 3 + 2] = pz;
      seeds[i] = Math.random() * Math.PI * 2;
      // Power curve: most particles sit near the bright core, a few stray out.
      mix[i] = Math.pow(Math.random(), colorMixPower);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: particleSize,
      map: sprite,
      vertexColors: true,
      transparent: true,
      opacity: isLight ? 0.85 : 0.95,
      depthWrite: false,
      blending: isLight ? THREE.NormalBlending : THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    const current = new THREE.Color(colorRef.current);
    const target = new THREE.Color(colorRef.current);
    const white = new THREE.Color(1, 1, 1);
    const tmp = new THREE.Color();

    const timer = new THREE.Timer();
    timer.connect(document);
    const colArr = geo.attributes.color.array as Float32Array;
    const pos = geo.attributes.position.array as Float32Array;
    let raf = 0;
    let smoothEnergy = 0;
    // A slow follower of the energy envelope. The gap between the snappy
    // `smoothEnergy` and this lagging average is the transient — it spikes on
    // audio onsets (a new word, a loud syllable) and decays back to zero. This
    // is what makes the orb read as *reactive to sound* rather than merely
    // breathing: the punch lands on the attack, not the sustain.
    let slowEnergy = 0;

    const BASE_SIZE = mat.size;

    function animate(timestamp = 0) {
      raf = requestAnimationFrame(animate);
      timer.update(timestamp);
      const dt = Math.min(timer.getDelta(), 0.05);
      const t = timer.getElapsed();

      target.set(colorRef.current);
      current.lerp(target, 0.05);
      // Snappy attack, gentler release so the orb leaps on input but settles softly.
      const reactive = energyRef.current > smoothEnergy ? 0.45 : 0.1;
      smoothEnergy += (energyRef.current - smoothEnergy) * reactive;
      slowEnergy += (smoothEnergy - slowEnergy) * 0.05;
      const E = smoothEnergy;
      // Transient: how far the live level has jumped above its recent average.
      const flash = Math.max(0, E - slowEnergy);

      // Baseline breathing gets a firmer swell with level, and the transient
      // adds a sharp bloom on top so onsets visibly "pop." Every growth term
      // is capped so the worst-case particle radius (~2.08 × 1.18 × 1.15 ×
      // 1.15 ≈ 3.25 world units) stays inside the camera's ~3.49-unit visible
      // half-height — uncapped, loud transients pushed past 4.5 and the sphere
      // got hard-sliced at the canvas edge. The canvas's radial mask fades the
      // last stretch as a guarantee.
      const breathe = Math.min(
        1 +
          Math.sin(t * 1.4) * (0.02 + E * 0.06) * motion +
          E * 0.16 +
          flash * 0.24,
        1.18,
      );
      points.scale.setScalar(breathe);

      // Particles swell and brighten on transients — a glow-punch that tracks
      // the audio, not just the sphere's size.
      mat.size = BASE_SIZE * (1 + E * 0.25 + flash * 0.35);

      const expand = Math.min(1 + E * 0.2 + flash * 0.15, 1.15);
      const wob = (0.01 + E * 0.14 + flash * 0.1) * motion;
      // High-frequency surface agitation, scaled by level: the sphere's skin
      // roughens into a shimmering, waveform-like texture when it's loud and
      // goes glassy-smooth in silence.
      const ripple = (E * 0.06 + flash * 0.12) * motion;

      for (let i = 0; i < N; i++) {
        const ix = i * 3;
        const iy = i * 3 + 1;
        const iz = i * 3 + 2;
        const m = mix[i]!;

        // Color: dark theme glows white→accent; light theme reads as a
        // saturated accent dot that darkens toward the rim.
        if (isLight) {
          tmp.copy(current).multiplyScalar(1 - m * 0.6);
        } else {
          tmp.copy(white).lerp(current, m);
        }
        colArr[ix] = tmp.r;
        colArr[iy] = tmp.g;
        colArr[iz] = tmp.b;

        const wobble =
          Math.sin(t * 1.8 + seeds[i]!) * wob +
          Math.sin(t * 7.0 + seeds[i]! * 3.1) * ripple;
        const k = expand * Math.min(1 + wobble, 1.15);
        const ox = original[ix]! * k;
        const oy = original[iy]! * k;
        const oz = original[iz]! * k;
        velocities[ix]! += (ox - pos[ix]!) * 0.04;
        velocities[iy]! += (oy - pos[iy]!) * 0.04;
        velocities[iz]! += (oz - pos[iz]!) * 0.04;
        velocities[ix]! *= 0.88;
        velocities[iy]! *= 0.88;
        velocities[iz]! *= 0.88;
        pos[ix]! += velocities[ix]!;
        pos[iy]! += velocities[iy]!;
        pos[iz]! += velocities[iz]!;
      }
      geo.attributes.color.needsUpdate = true;
      geo.attributes.position.needsUpdate = true;

      points.rotation.y += dt * (0.06 + E * 1.05 + flash * 1.4) * motion;
      points.rotation.x = Math.sin(t * 0.2) * 0.12;

      renderer.render(scene, camera);
    }

    function resize() {
      W = host.clientWidth || 288;
      H = host.clientHeight || 288;
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H, false);
    }

    // Track the element's real box, not just window resizes — otherwise a CSS
    // size change (e.g. the orb's layout) leaves the render buffer stale and the
    // old-resolution image gets stretched, making the orb look wrongly sized.
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    animate();

    return () => {
      cancelAnimationFrame(raf);
      timer.disconnect();
      ro.disconnect();
      geo.dispose();
      mat.dispose();
      sprite.dispose();
      renderer.dispose();
    };
  }, [isLight, particleCount, particleSize, colorMixPower, cameraZ]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        // Fade to transparent well before the canvas edge so the particle
        // field can never be seen hard-clipped by the canvas rectangle, no
        // matter how far a loud transient throws it.
        WebkitMaskImage:
          "radial-gradient(circle, black 55%, transparent 92%)",
        maskImage: "radial-gradient(circle, black 55%, transparent 92%)",
      }}
      aria-hidden="true"
    />
  );
}
