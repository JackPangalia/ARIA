"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export function LandingOrb({
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
      color: { r: 0.29, g: 0.94, b: 0.66 },
      count: compact ? 8000 : 14000,
      particleSize: compact ? 0.05 : 0.055,
    };

    const host = canvas;
    let W = host.clientWidth;
    let H = host.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
    camera.position.z = 6.2;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(W, H, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    function makeSprite() {
      const s = 64;
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
      return new THREE.CanvasTexture(c);
    }
    const sprite = makeSprite();

    const N = cfg.count;
    const RADIUS = 2.0;
    const positions = new Float32Array(N * 3);
    const original = new Float32Array(N * 3);
    const velocities = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const seeds = new Float32Array(N);

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

      const t = Math.pow(Math.random(), 1.6);
      colors[i * 3] = 1 - t * (1 - cfg.color.r);
      colors[i * 3 + 1] = 1 - t * (1 - cfg.color.g);
      colors[i * 3 + 2] = 1 - t * (1 - cfg.color.b);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: cfg.particleSize,
      map: sprite,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geo, mat);
    scene.add(points);

    const coreGeo = new THREE.SphereGeometry(1.55, 32, 32);
    const coreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(
        cfg.color.r * 0.25,
        cfg.color.g * 0.4,
        cfg.color.b * 0.32,
      ),
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    scene.add(core);

    const mouse = new THREE.Vector2(-10, -10);
    const mouseWorld = new THREE.Vector3(999, 999, 0);
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

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("mouseleave", onLeave);

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
      const R = RADIUS * 1.15;
      const b = 2 * origin.dot(dir);
      const c = origin.dot(origin) - R * R;
      const disc = b * b - 4 * c;
      if (disc > 0) {
        const t = (-b - Math.sqrt(disc)) / 2;
        mouseWorld.copy(origin).addScaledVector(dir, t);
      } else {
        const t = -origin.dot(dir);
        mouseWorld.copy(origin).addScaledVector(dir, Math.max(t, 0));
      }
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
      core.scale.setScalar(breathe);

      const influence = 1.4;
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

      points.rotation.y += dt * 0.12 * (0.4 + I);
      points.rotation.x = Math.sin(t * 0.2) * 0.12;
      core.rotation.copy(points.rotation);

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
      coreGeo.dispose();
      coreMat.dispose();
      sprite.dispose();
      renderer.dispose();
    };
  }, [compact]);

  return (
    <canvas ref={canvasRef} className={className} aria-hidden="true" />
  );
}
