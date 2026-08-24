"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { energyFor, type Mode } from "@/components/aria/visual-state";
import { useAriaStore } from "@/lib/store";

const ENERGY_ATTACK_MS = 18;
const ENERGY_RELEASE_MS = 110;
const MODE_TWEEN_MS = 280;
const LEVEL_ATTACK_MS = 22;
const LEVEL_RELEASE_MS = 95;

function approach(
  current: number,
  target: number,
  halfLifeMs: number,
  dtMs: number,
): number {
  if (halfLifeMs <= 0 || dtMs <= 0) return dtMs <= 0 ? current : target;
  const k = 1 - Math.pow(2, -dtMs / halfLifeMs);
  return current + (target - current) * k;
}

function flagsFor(mode: Mode) {
  const listen =
    mode === "listen" || mode === "followup" || mode === "wake" ? 1 : 0;
  const think = mode === "think" || mode === "search" ? 1 : 0;
  const speak = mode === "speak" ? 1 : 0;
  return { listen, think, speak };
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Voice orb: a solid two-tone disc. The terminator rotates and the
 * sphere breathes; no noise, grain, or haze.
 */
const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uSpin;
uniform float uEnergy;
uniform float uListen;
uniform float uThink;
uniform float uSpeak;
uniform float uInput;
uniform float uOutput;
uniform float uScale;

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float r = length(uv);
  float sphereR = 0.70 * uScale;
  float nr = r / sphereR;

  if (nr > 1.02) {
    discard;
  }

  vec2 p = uv / sphereR;
  float z = sqrt(max(0.0, 1.0 - min(1.0, dot(p, p))));
  vec3 nrm = normalize(vec3(p, z));

  float a = uTime * uSpin;
  vec2 dir = vec2(cos(a), sin(a));

  float g = dot(p, dir) * 0.5 + 0.5;
  g += (1.0 - z) * 0.05;
  g -= (uSpeak * uOutput * 0.04 + uListen * uInput * 0.03);
  g += sin(uTime * 1.15) * uThink * 0.018;
  g = clamp(g, 0.0, 1.0);

  // Oatmeal cream (#e3ded1) and lifted ink (#252620) — each sits off the
  // page so the disc doesn't collapse to a half-circle in either theme.
  vec3 lit = vec3(0.890, 0.871, 0.820);
  vec3 deep = vec3(0.145, 0.149, 0.125);

  // Hard terminator — one pixel of AA so the cut stays crisp without stair-steps.
  float edge = max(fwidth(g), 0.0008);
  vec3 col = mix(lit, deep, smoothstep(0.5 - edge, 0.5 + edge, g));

  vec3 lightDir = normalize(vec3(-0.35, 0.48, 0.80));
  float diff = max(0.0, dot(nrm, lightDir));
  col *= 0.90 + diff * 0.12;

  float aa = max(0.0035, fwidth(nr) * 1.35);
  float alpha = 1.0 - smoothstep(1.0 - aa, 1.0, nr);
  gl_FragColor = vec4(col, alpha);
}
`;

export function GlowOrb(props: { mode: Mode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(props.mode);
  useEffect(() => {
    modeRef.current = props.mode;
  }, [props.mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(3, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = {
      uTime: { value: 0 },
      uSpin: { value: 0.18 },
      uEnergy: { value: 0 },
      uListen: { value: 0 },
      uThink: { value: 0 },
      uSpeak: { value: 0 },
      uInput: { value: 0 },
      uOutput: { value: 0 },
      uScale: { value: 1 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    const fit = () => {
      const size = Math.max(1, wrap.clientWidth);
      renderer.setSize(size, size, false);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(wrap);

    let frame = 0;
    let last = performance.now();
    let energy = 0;
    let listen = 0;
    let think = 0;
    let speak = 0;
    let input = 0;
    let output = 0;
    let spin = 0.18;
    let time = 0;
    const start = flagsFor(props.mode);
    listen = start.listen;
    think = start.think;
    speak = start.speak;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(64, now - last);
      last = now;

      const mode = modeRef.current;
      const store = useAriaStore.getState();
      const flags = flagsFor(mode);
      const mic = Math.min(1, Math.max(0, store.micLevel));
      const play = Math.min(1, Math.max(0, store.playbackLevel));
      const targetEnergy = reduceMotion
        ? 0
        : energyFor(mode, store.micLevel, store.playbackLevel);
      const targetInput = flags.listen ? mic : 0;
      const targetOutput = flags.speak ? Math.max(0.12, play) : 0;

      energy = approach(
        energy,
        targetEnergy,
        targetEnergy > energy ? ENERGY_ATTACK_MS : ENERGY_RELEASE_MS,
        dt,
      );
      input = approach(
        input,
        targetInput,
        targetInput > input ? LEVEL_ATTACK_MS : LEVEL_RELEASE_MS,
        dt,
      );
      output = approach(
        output,
        targetOutput,
        targetOutput > output ? LEVEL_ATTACK_MS : LEVEL_RELEASE_MS,
        dt,
      );
      listen = approach(listen, flags.listen, MODE_TWEEN_MS, dt);
      think = approach(think, flags.think, MODE_TWEEN_MS, dt);
      speak = approach(speak, flags.speak, MODE_TWEEN_MS, dt);

      const targetSpin =
        0.14 + listen * 0.1 + think * 0.95 + speak * 0.42 + energy * 0.06;
      spin = approach(spin, targetSpin, 180, dt);

      if (!reduceMotion) time += dt * 0.001;

      const breathe = 1 + 0.014 * Math.sin(time * 1.05);
      const scale =
        breathe * (1 + speak * output * 0.07 + listen * input * 0.04);

      uniforms.uTime.value = time;
      uniforms.uSpin.value = spin;
      uniforms.uEnergy.value = energy;
      uniforms.uListen.value = listen;
      uniforms.uThink.value = think;
      uniforms.uSpeak.value = speak;
      uniforms.uInput.value = input;
      uniforms.uOutput.value = output;
      uniforms.uScale.value = reduceMotion ? 1 : scale;
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
    // Loop reads mode through a ref so a state change never rebuilds WebGL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0" aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
