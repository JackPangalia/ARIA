"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { energyFor, type Mode } from "@/components/aria/visual-state";
import { useTheme } from "@/components/theme/ThemeProvider";
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
 * ChatGPT-style voice orb: a perfectly smooth circular limb holding
 * raymarched ice/white gas. No mesh, so no facets.
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
uniform float uLight;
uniform float uScale;

vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yxz + 19.19);
  return -1.0 + 2.0 * fract(vec3(p3.x + p3.y, p3.x + p3.z, p3.y + p3.z) * p3.zyx);
}

float snoise(vec3 p) {
  const float K1 = 0.333333333;
  const float K2 = 0.166666667;
  vec3 i = floor(p + (p.x + p.y + p.z) * K1);
  vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
  vec3 e = step(vec3(0.0), d0 - d0.yzx);
  vec3 i1 = e * (1.0 - e.zxy);
  vec3 i2 = 1.0 - e.zxy * (1.0 - e);
  vec3 d1 = d0 - (i1 - K2);
  vec3 d2 = d0 - (i2 - K1);
  vec3 d3 = d0 - 0.5;
  vec4 h = max(0.6 - vec4(dot(d0, d0), dot(d1, d1), dot(d2, d2), dot(d3, d3)), 0.0);
  vec4 n = h * h * h * h * vec4(
    dot(d0, hash33(i)),
    dot(d1, hash33(i + i1)),
    dot(d2, hash33(i + i2)),
    dot(d3, hash33(i + 1.0))
  );
  return dot(vec4(31.316), n);
}

float fbm(vec3 p) {
  float f = 0.0;
  float a = 0.5;
  mat3 m = mat3(
    0.00,  0.80,  0.60,
   -0.80,  0.36, -0.48,
   -0.60, -0.48,  0.64
  );
  for (int i = 0; i < 3; i++) {
    f += a * snoise(p);
    p = m * p * 1.9;
    a *= 0.5;
  }
  return f;
}

vec3 rotY(vec3 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

vec3 rotX(vec3 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float r = length(uv);
  float sphereR = 0.72 * uScale;
  float nr = r / sphereR;

  vec3 ice = vec3(0.73, 0.85, 1.0);
  vec3 steel = vec3(0.58, 0.72, 0.92);
  vec3 lilac = vec3(0.80, 0.76, 0.96);
  vec3 white = vec3(0.97, 0.98, 1.0);
  vec3 deep = vec3(0.50, 0.66, 0.90);
  vec3 haloCol = mix(ice, lilac, 0.2);

  float halo = exp(-4.4 * max(0.0, r - sphereR * 0.9) / sphereR);
  halo *= (0.28 + uEnergy * 0.16) * mix(1.0, 0.42, uLight);
  float haloA = halo * smoothstep(1.42, 0.98, nr);

  if (nr > 1.002) {
    gl_FragColor = vec4(haloCol, haloA * 0.5);
    return;
  }

  // Analytic sphere (pixel-smooth, never faceted).
  float z = sqrt(max(0.0, 1.0 - nr * nr));
  vec3 nrm = vec3(uv / sphereR, z);

  float t = uTime * uSpin;

  // Cheap volume: samples along the view chord through the sphere.
  vec3 acc = vec3(0.0);
  float trans = 1.0;
  float turb = 1.05 + uThink * 0.18 + uSpeak * 0.12 + uEnergy * 0.08;

  for (int i = 0; i < 8; i++) {
    float fi = float(i) / 7.0;
    vec3 sp = rotY(rotX(nrm * (1.0 - fi * 0.55), t * 0.37), t);
    float n = fbm(sp * turb + vec3(0.0, uTime * 0.08, 0.12));
    float dens = smoothstep(0.1, 0.74, n * 0.5 + 0.5);
    dens *= 0.24 + 0.2 * (1.0 - fi);
    vec3 sCol = mix(deep, ice, dens);
    sCol = mix(sCol, steel, (1.0 - dens) * 0.22);
    sCol = mix(sCol, lilac, uThink * 0.08 + dens * 0.08);
    sCol = mix(sCol, white, smoothstep(0.42, 1.0, dens) * 0.28);
    acc += trans * dens * sCol;
    trans *= 1.0 - dens * 0.7;
  }

  vec3 col = acc + trans * mix(ice, white, 0.28);

  vec3 L = normalize(vec3(-0.38, 0.5, 0.82));
  float wrap = clamp(dot(nrm, L) * 0.28 + 0.78, 0.0, 1.05);
  col *= wrap;

  float fres = pow(1.0 - nrm.z, 2.35);
  col = mix(col, ice, fres * 0.18);
  col = mix(col, white, fres * fres * 0.12);

  float ang = uTime * (0.24 + uThink * 0.4 + uSpeak * 0.22);
  vec2 lamp = vec2(cos(ang), sin(ang * 0.87)) * sphereR * 0.22;
  float lampD = length(uv - lamp);
  col += exp(-lampD * lampD * 13.0) * (0.08 + uEnergy * 0.1) * white;
  col += uSpeak * uOutput * 0.06 * ice;
  col += uListen * uInput * 0.04 * ice;
  col *= mix(1.0, 0.98, uLight);

  float limb = 1.0 - smoothstep(0.985, 1.0, nr);
  col = mix(haloCol, col, limb);
  float alpha = max(limb, haloA * 0.16);
  gl_FragColor = vec4(col, alpha);
}
`;

export function GlowOrb(props: { mode: Mode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(props.mode);
  const { resolvedTheme } = useTheme();
  const lightRef = useRef(resolvedTheme === "light" ? 1 : 0);
  useEffect(() => {
    modeRef.current = props.mode;
  }, [props.mode]);
  useEffect(() => {
    lightRef.current = resolvedTheme === "light" ? 1 : 0;
  }, [resolvedTheme]);

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
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
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
      uLight: { value: lightRef.current },
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
      uniforms.uLight.value = lightRef.current;
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
    // Loop reads mode/theme through refs so a state change never rebuilds WebGL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0" aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
