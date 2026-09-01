"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { energyFor, type Mode } from "@/components/aria/visual-state";
import {
  orbBodyIndex,
  useOrbBody,
  type OrbBody,
} from "@/lib/orb/orb-body";
import { useAriaStore } from "@/lib/store";

const ENERGY_ATTACK_MS = 18;
const ENERGY_RELEASE_MS = 110;
const MODE_TWEEN_MS = 420;
const LEVEL_ATTACK_MS = 22;
const LEVEL_RELEASE_MS = 95;
const BODY_CROSSFADE_MS = 220;

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
 * Voice orb: oatmeal cream or workspace ink. Breath carries state.
 * No terminator, no grain, no planet texture.
 */
const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uEnergy;
uniform float uListen;
uniform float uThink;
uniform float uSpeak;
uniform float uInput;
uniform float uOutput;
uniform float uScale;
uniform float uPulse;
uniform float uDark;
uniform float uBody;
uniform float uBodyNext;
uniform float uBodyMix;

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float r = length(uv);
  float sphereR = 0.70 * uScale;
  float nr = r / sphereR;

  if (nr > 1.03) {
    discard;
  }

  vec2 p = uv / sphereR;
  float z = sqrt(max(0.0, 1.0 - min(1.0, dot(p, p))));
  vec3 nrm = normalize(vec3(p, z));

  vec3 cream = vec3(0.890, 0.871, 0.820);
  vec3 ink = vec3(0.125, 0.129, 0.114);
  vec3 albA = uBody < 0.5 ? cream : ink;
  vec3 albB = uBodyNext < 0.5 ? cream : ink;
  vec3 alb = mix(albA, albB, uBodyMix);

  vec3 lightDir = normalize(vec3(-0.40, 0.56, 0.74));
  float lambert = max(0.0, dot(nrm, lightDir));
  float wrap = lambert * 0.58 + 0.42;
  float back = max(0.0, -dot(nrm, lightDir));
  vec3 view = vec3(0.0, 0.0, 1.0);
  vec3 halfV = normalize(lightDir + view);
  float spec = pow(max(0.0, dot(nrm, halfV)), 36.0);
  float fres = pow(1.0 - z, 2.6);
  float specAmt = mix(0.16, 0.10, mix(uBody, uBodyNext, uBodyMix));

  float glow = 0.08 + uPulse * 0.07 + uEnergy * 0.06;
  glow += uListen * uInput * 0.05 + uSpeak * uOutput * 0.08 + uThink * 0.03;

  vec3 col = alb * (0.46 + wrap * 0.50 + glow);
  col += alb * 0.16 * back;
  col += vec3(0.969, 0.953, 0.914) * spec * specAmt;
  col += alb * fres * 0.08;
  col = max(col, alb * 0.28);
  col += mix(0.0, 0.04, uDark);
  col = clamp(col, 0.0, 1.0);

  float aa = max(0.0035, fwidth(nr) * 1.35);
  float alpha = 1.0 - smoothstep(1.0 - aa, 1.0, nr);
  gl_FragColor = vec4(col, alpha);
}
`;

export function GlowOrb(props: {
  mode: Mode;
  /** Preview-only mic envelope. Live sessions omit this and read the store. */
  previewMic?: number;
  /** Preview-only playback envelope. Live sessions omit this and read the store. */
  previewPlayback?: number;
  /** Force the still pose used for prefers-reduced-motion. */
  still?: boolean;
  /** Override the stored skin. Settings thumbs and the preview pass this. */
  body?: OrbBody;
  /** Smaller pixel ratio for picker thumbnails. */
  compact?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [storedBody] = useOrbBody();
  const modeRef = useRef(props.mode);
  const previewMicRef = useRef(props.previewMic);
  const previewPlaybackRef = useRef(props.previewPlayback);
  const stillRef = useRef(props.still);
  const bodyRef = useRef(props.body ?? storedBody);
  useEffect(() => {
    modeRef.current = props.mode;
    previewMicRef.current = props.previewMic;
    previewPlaybackRef.current = props.previewPlayback;
    stillRef.current = props.still;
    bodyRef.current = props.body ?? storedBody;
  }, [
    props.mode,
    props.previewMic,
    props.previewPlayback,
    props.still,
    props.body,
    storedBody,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(
      Math.min(props.compact ? 1.25 : 3, window.devicePixelRatio || 1),
    );
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.getContext().disable(renderer.getContext().DITHER);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const startBody = orbBodyIndex(bodyRef.current);
    const uniforms = {
      uEnergy: { value: 0 },
      uListen: { value: 0 },
      uThink: { value: 0 },
      uSpeak: { value: 0 },
      uInput: { value: 0 },
      uOutput: { value: 0 },
      uScale: { value: 1 },
      uPulse: { value: 0.5 },
      uDark: { value: 0 },
      uBody: { value: startBody },
      uBodyNext: { value: startBody },
      uBodyMix: { value: 1 },
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
    let time = 0;
    let bodyFrom = startBody;
    let bodyTo = startBody;
    let bodyMix = 1;
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
      const reduceMotion = stillRef.current || prefersReduced;
      const rawMic = previewMicRef.current ?? store.micLevel;
      const rawPlay = previewPlaybackRef.current ?? store.playbackLevel;
      const mic = Math.min(1, Math.max(0, rawMic));
      const play = Math.min(1, Math.max(0, rawPlay));
      const targetEnergy = reduceMotion
        ? 0
        : energyFor(mode, rawMic, rawPlay);
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

      const targetBody = orbBodyIndex(bodyRef.current);
      if (targetBody !== bodyTo) {
        if (bodyMix > 0.97) bodyFrom = bodyTo;
        bodyTo = targetBody;
        bodyMix = 0;
      }
      bodyMix = approach(bodyMix, 1, BODY_CROSSFADE_MS, dt);

      if (!reduceMotion) time += dt * 0.001;

      const idleBreath = 0.014 * Math.sin(time * 0.85);
      const thinkBreath = 0.026 * Math.sin(time * 0.55);
      const listenBreath = 0.010 + input * 0.036;
      const speakBreath = 0.008 + output * 0.048;
      const breath =
        idleBreath * Math.max(0, 1 - listen - think - speak) +
        thinkBreath * think +
        listenBreath * listen +
        speakBreath * speak;
      const scale = 1 + (reduceMotion ? 0 : breath);
      const pulse = reduceMotion
        ? 0.45
        : 0.5 + 0.5 * Math.sin(time * (0.7 + think * -0.2 + speak * 0.15));

      uniforms.uEnergy.value = energy;
      uniforms.uListen.value = listen;
      uniforms.uThink.value = think;
      uniforms.uSpeak.value = speak;
      uniforms.uInput.value = input;
      uniforms.uOutput.value = output;
      uniforms.uScale.value = scale;
      uniforms.uPulse.value = pulse;
      uniforms.uDark.value = document.documentElement.classList.contains("dark")
        ? 1
        : 0;
      uniforms.uBody.value = bodyFrom;
      uniforms.uBodyNext.value = bodyTo;
      uniforms.uBodyMix.value = bodyMix;
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
    // Loop reads mode and body through refs so a change never rebuilds WebGL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.compact]);

  return (
    <div ref={wrapRef} className="absolute inset-0" aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
