"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Torus-knot particle weave, adapted from a generic "Woven by Light" demo
 * into Kivo's brand palette and lifecycle conventions (mirrors LandingOrb.tsx:
 * mouse-reactive settle, prefers-reduced-motion, canvas prop API).
 */
export function WovenParticleField({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const cfg = {
      intensity: reduceMotion ? 0.15 : compact ? 0.65 : 0.7,
      // deep teal core -> brand mint edge; tuned to read against a light
      // background (additive/white-hot particles would wash out on white)
      colorDeep: { r: 0.02, g: 0.35, b: 0.26 },
      colorEdge: { r: 0.09, g: 0.79, b: 0.56 },
      count: reduceMotion ? 6000 : compact ? 9000 : 16000,
      particleSize: compact ? 0.014 : 0.016,
    };

    const host = canvas;
    let W = host.clientWidth;
    let H = host.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
    camera.position.z = 5.2;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(W, H, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const N = cfg.count;
    const positions = new Float32Array(N * 3);
    const original = new Float32Array(N * 3);
    const velocities = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const seeds = new Float32Array(N);

    const knot = new THREE.TorusKnotGeometry(1.5, 0.5, 220, 24);
    const knotCount = knot.attributes.position.count;

    for (let i = 0; i < N; i++) {
      const v = i % knotCount;
      const px = knot.attributes.position.getX(v);
      const py = knot.attributes.position.getY(v);
      const pz = knot.attributes.position.getZ(v);
      positions[i * 3] = original[i * 3] = px;
      positions[i * 3 + 1] = original[i * 3 + 1] = py;
      positions[i * 3 + 2] = original[i * 3 + 2] = pz;
      seeds[i] = Math.random() * Math.PI * 2;

      const t = Math.pow(Math.random(), 1.6);
      colors[i * 3] = cfg.colorDeep.r + t * (cfg.colorEdge.r - cfg.colorDeep.r);
      colors[i * 3 + 1] =
        cfg.colorDeep.g + t * (cfg.colorEdge.g - cfg.colorDeep.g);
      colors[i * 3 + 2] =
        cfg.colorDeep.b + t * (cfg.colorEdge.b - cfg.colorDeep.b);
    }
    knot.dispose();

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: cfg.particleSize,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geo, mat);
    scene.add(points);

    const mouse = new THREE.Vector2(-10, -10);
    const mouseWorld = new THREE.Vector3(999, 999, 999);
    let hasPointer = false;

    function onMove(e: MouseEvent | TouchEvent) {
      const rect = host.getBoundingClientRect();
      const cx =
        "touches" in e ? e.touches[0]?.clientX : (e as MouseEvent).clientX;
      const cy =
        "touches" in e ? e.touches[0]?.clientY : (e as MouseEvent).clientY;
      if (cx == null || cy == null) return;
      if (
        cx < rect.left ||
        cx > rect.right ||
        cy < rect.top ||
        cy > rect.bottom
      ) {
        hasPointer = false;
        return;
      }
      mouse.x = ((cx - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((cy - rect.top) / rect.height) * 2 + 1;
      hasPointer = true;
    }
    const onLeave = () => {
      hasPointer = false;
    };

    if (!reduceMotion) {
      window.addEventListener("mousemove", onMove, { passive: true });
      window.addEventListener("touchmove", onMove, { passive: true });
      window.addEventListener("mouseleave", onLeave);
    }

    const timer = new THREE.Timer();
    timer.connect(document);
    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();

    function updateMouseWorld() {
      if (!hasPointer) {
        mouseWorld.set(999, 999, 999);
        return;
      }
      raycaster.setFromCamera(mouse, camera);
      const dir = raycaster.ray.direction;
      const origin = raycaster.ray.origin;
      const t = -origin.z / dir.z;
      mouseWorld.copy(origin).addScaledVector(dir, t);
    }

    const pos = geo.attributes.position.array as Float32Array;
    let raf = 0;

    function animate(timestamp = 0) {
      raf = requestAnimationFrame(animate);
      timer.update(timestamp);
      const dt = Math.min(timer.getDelta(), 0.05);
      const t = timer.getElapsed();
      const I = cfg.intensity;

      updateMouseWorld();

      const breathe = 1 + Math.sin(t * 1.1) * 0.03 * (0.5 + I);
      points.scale.setScalar(breathe);

      const influence = 1.5;
      const reach = mouseWorld.x < 900;

      for (let i = 0; i < N; i++) {
        const ix = i * 3;
        const iy = i * 3 + 1;
        const iz = i * 3 + 2;

        const s = seeds[i]!;
        const wobble = Math.sin(t * 1.6 + s) * 0.012 * I;

        tmpA.set(pos[ix]!, pos[iy]!, pos[iz]!);

        if (reach) {
          tmpB.subVectors(tmpA, mouseWorld);
          const d = tmpB.length();
          if (d < influence) {
            const f = (influence - d) / influence;
            tmpB.normalize().multiplyScalar(f * f * 0.06 * (0.4 + I));
            velocities[ix]! += tmpB.x;
            velocities[iy]! += tmpB.y;
            velocities[iz]! += tmpB.z;
          }
        }

        const ox = original[ix]! * (1 + wobble);
        const oy = original[iy]! * (1 + wobble);
        const oz = original[iz]! * (1 + wobble);
        velocities[ix]! += (ox - pos[ix]!) * 0.02;
        velocities[iy]! += (oy - pos[iy]!) * 0.02;
        velocities[iz]! += (oz - pos[iz]!) * 0.02;

        velocities[ix]! *= 0.9;
        velocities[iy]! *= 0.9;
        velocities[iz]! *= 0.9;

        pos[ix]! += velocities[ix]!;
        pos[iy]! += velocities[iy]!;
        pos[iz]! += velocities[iz]!;
      }
      geo.attributes.position.needsUpdate = true;

      points.rotation.y += dt * (reduceMotion ? 0.03 : 0.12) * (0.4 + I);
      points.rotation.x = Math.sin(t * 0.2) * 0.1;

      renderer.render(scene, camera);
    }

    function resize() {
      W = host.clientWidth;
      H = host.clientHeight;
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H, false);
    }

    window.addEventListener("resize", resize);
    resize();
    animate();

    return () => {
      cancelAnimationFrame(raf);
      timer.disconnect();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("resize", resize);
      geo.dispose();
      mat.dispose();
      renderer.dispose();
    };
  }, [compact]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
