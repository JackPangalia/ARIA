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
}: {
  color: string;
  energy: number;
  isLight: boolean;
  className?: string;
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

    const N = 13000;
    const RADIUS = 2.0;

    const host = canvas;
    let W = host.clientWidth || 288;
    let H = host.clientHeight || 288;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
    // Pulled back to match the canvas being ~1.4x its layout box (see
    // OrbVisualizer): keeps the resting orb the same on-screen size while
    // leaving margin so loud-state expansion isn't clipped at the frustum edge.
    camera.position.z = 6.7;

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
      mix[i] = Math.pow(Math.random(), 1.6);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.052,
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

    const coreGeo = new THREE.SphereGeometry(1.55, 32, 32);
    const coreMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: isLight ? 0.12 : 0.35,
      blending: isLight ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    scene.add(core);

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

    function animate(timestamp = 0) {
      raf = requestAnimationFrame(animate);
      timer.update(timestamp);
      const dt = Math.min(timer.getDelta(), 0.05);
      const t = timer.getElapsed();

      target.set(colorRef.current);
      current.lerp(target, 0.05);
      // Snappy attack, gentler release so the orb leaps on input but settles softly.
      const reactive = energyRef.current > smoothEnergy ? 0.35 : 0.12;
      smoothEnergy += (energyRef.current - smoothEnergy) * reactive;
      const E = smoothEnergy;

      const breathe =
        1 + Math.sin(t * 1.4) * (0.03 + E * 0.09) * motion + E * 0.12;
      points.scale.setScalar(breathe);
      core.scale.setScalar(breathe);

      const expand = 1 + E * 0.16;
      const wob = (0.012 + E * 0.1) * motion;

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

        const wobble = Math.sin(t * 1.8 + seeds[i]!) * wob;
        const k = expand * (1 + wobble);
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

      coreMat.color.copy(current).multiplyScalar(isLight ? 0.5 : 0.35);

      points.rotation.y += dt * (0.08 + E * 0.95) * motion;
      points.rotation.x = Math.sin(t * 0.2) * 0.12;
      core.rotation.copy(points.rotation);

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
      coreGeo.dispose();
      coreMat.dispose();
      sprite.dispose();
      renderer.dispose();
    };
  }, [isLight]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
    />
  );
}
