import { useLayoutEffect, useRef } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Maya's ribbon, as a circle: a port of the app's 2D fallback
 * (outerview/main/client/src/features/interview-v2/components/voice-wave-2d.tsx), with the
 * constants from voice-wave.tsx. Same strands, entrance, glints and embers; no thinking,
 * pausing, face or pointer.
 *
 * The app eases its state (speed, weave, warp) toward Maya's voice a frame at a time. Here the
 * voice is made up (`voiceAt`), and that easing is replayed from frame 0 up to the current one,
 * so any frame renders the same on its own.
 */

const STRANDS = 12;
const SEGMENTS = 144;
const RUN = 8;
const PARTICLES = 260;
const HALO_PX = 9;
const CORE_PX = 1.6;
const MIN_WARP_LEVEL = 0.29;
const MAX_WARP_LEVEL = 0.7;
const SPEAKING_WARP_LEVEL = 0.5;
const GLINT = { spots: 5, width: 0.035, drift: 0.04, gain: 1.6 };
const APPEAR = { stagger: 2.2, grow: 2.8, apart: 0.2, zoom: 0.9 };
const APPEAR_TOTAL = APPEAR.stagger + APPEAR.grow;
const APPEAR_DONE = APPEAR_TOTAL + 0.5;

type Rgb = [number, number, number];
const BRAND_DEEP: Rgb = [0.76, 0.14, 0.2];
const BRAND: Rgb = [0.9, 0.23, 0.18];
const BRAND_LIGHT: Rgb = [0.98, 0.42, 0.3];
const EXTREME: Rgb = [1, 0.78, 0.28];
const TAU = 6.28318;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const fract = (x: number) => x - Math.floor(x);
const mod = (x: number, m: number) => ((x % m) + m) % m;
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const ramp3 = (t: number, a: Rgb, b: Rgb, c: Rgb): Rgb => {
  t = clamp01(t) * 2;
  return t < 1 ? mixRgb(a, b, smoothstep(0, 1, t)) : mixRgb(b, c, smoothstep(0, 1, t - 1));
};
const rgba = ([r, g, b]: Rgb, a: number) =>
  `rgba(${Math.round(clamp01(r) * 255)},${Math.round(clamp01(g) * 255)},${Math.round(clamp01(b) * 255)},${clamp01(a).toFixed(3)})`;
const hash = (n: number) => fract(Math.sin(n * 12.9898) * 43758.5453);
const follow = (cur: number, target: number, dt: number, attack: number, release: number) =>
  cur + (target - cur) * (1 - Math.exp(-(target > cur ? attack : release) * dt));
const warpBend = (warp: number) => {
  const t = clamp01((warp - 0.04) / (MAX_WARP_LEVEL - 0.04));
  return t * t * (3 - 2 * t);
};
const zoomFor = (formed: number) => APPEAR.zoom + (1 - APPEAR.zoom) * formed;

/** A calm voice: soft phrases with syllables in them, never quite silent. */
function voiceAt(t: number) {
  const phrase = 0.5 + 0.5 * Math.sin(t * 0.9 - 1.2);
  const syllables = 0.55 + 0.45 * Math.sin(t * 6.1) * Math.sin(t * 3.7 + 0.8);
  return 0.08 + 0.32 * phrase * syllables;
}

interface Scene { width: number; height: number; unit: number; flow: number; stir: number; warp: number; restWarp: number }

/** The circle, from the bottom up the left side: px from the centre, y up. */
const curve = (sc: Scene, s: number): [number, number] => {
  const a = -1.5708 - TAU * s;
  return [Math.cos(a) * sc.unit * 0.33, Math.sin(a) * sc.unit * 0.33];
};
const normalAt = (s: number): [number, number] => {
  const a = -1.5708 - TAU * s;
  return [-Math.cos(a), -Math.sin(a)];
};

interface Strand { env: number; w: number; amp: number; rest: number }

function strandAt(sc: Scene, s: number, f: number): Strand {
  const amp = 0.11 * sc.unit;
  const rest = 0.045 * sc.unit;
  const off = f * (2.9 + 0.4 * sc.stir);
  const shimmer = 0.14 * sc.stir;
  const w = (Math.sin(TAU * 2 * s + sc.flow * 2 + off) * 0.62
    + Math.sin(TAU * 3 * s - sc.flow * 1.5 + off * 1.6) * 0.28
    + Math.sin(TAU * 6 * s + sc.flow * 3.2 + f * 6) * shimmer) * (1.04 / (0.9 + shimmer));
  return { env: 1, w, amp, rest };
}

/** A closed shape swells inward: its outer edge holds still as the band widens. */
const strandOffset = (sc: Scene, r: Strand, f: number) =>
  r.env * mix(r.rest * (f * 2 - 1), r.amp * r.w, sc.warp)
  - r.env * Math.max(0, mix(r.rest, r.amp, sc.warp) - mix(r.rest, r.amp, sc.restWarp));

const strandOrder = (f: number) => mod(Math.floor(f * (STRANDS - 1) + 0.5) * 7, STRANDS);
function strandGrown(f: number, appear: number) {
  const t = clamp01((appear - APPEAR.stagger * strandOrder(f) / STRANDS) / APPEAR.grow);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function strandDrawn(s: number, f: number, grown: number) {
  const o = strandOrder(f);
  const c = fract(o * 0.382 + 0.12);
  let d = Math.abs(s - c);
  d = Math.min(d, 1 - d);
  const soft = 0.08;
  return (1 - smoothstep(grown * (0.5 + soft) - soft, grown * (0.5 + soft), d)) * smoothstep(0, 0.35, grown);
}

function glintAt(s: number, f: number, time: number) {
  let g = 0;
  for (let i = 0; i < GLINT.spots; i++) {
    const dir = (i % 2) * 2 - 1;
    const c = fract(i * 0.382 + 0.07 + dir * time * GLINT.drift * (0.5 + 0.5 * fract(i * 0.618)));
    let d = Math.abs(s - c);
    d = Math.min(d, 1 - d);
    const twinkle = Math.pow(0.5 + 0.5 * Math.sin(time * (2.3 + 0.9 * i) + i * 2.1), 3);
    const strands = Math.pow(0.5 + 0.5 * Math.sin(f * 9 + i * 1.7 + time * (0.8 + 0.3 * i)), 2);
    g += Math.exp(-((d / GLINT.width) ** 2)) * twinkle * strands;
  }
  return Math.min(g, 1);
}

/** The app's per-frame easing, replayed from the first frame to `frame`. */
function stateAt(frame: number, fps: number) {
  const dt = 1 / fps;
  let maya = 0, phase = 0, speed = 0.12, stir = 0, warp = MIN_WARP_LEVEL, glint = 0;
  for (let i = 0; i <= frame; i++) {
    maya = follow(maya, voiceAt(i * dt), dt, 18, 4);
    const target = 0.12 + 1.1 * maya;
    speed += (target - speed) * (1 - Math.exp(-(target > speed ? 5 : 2.5) * dt));
    stir += (maya - stir) * (1 - Math.exp(-(maya > stir ? 2 : 1) * dt));
    phase += dt * (speed + 0.5 * maya);
    const bend = MIN_WARP_LEVEL + (SPEAKING_WARP_LEVEL - MIN_WARP_LEVEL) * clamp01(maya);
    warp += (bend - warp) * (1 - Math.exp(-(bend > warp ? 10 : 4) * dt));
    glint += (maya - glint) * (1 - Math.exp(-12 * dt));
  }
  return { maya, phase, stir, warp, glint };
}

/**
 * `entrance` speeds the strands' arrival up: 1 is the app's five seconds.
 * `size` is the canvas height the ribbon is sized off, as Maya's box is on the call screen.
 */
export const Ribbon = ({ entrance = 1, size }: { entrance?: number; size?: number }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();

  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const time = frame / fps;
    const { maya, phase, stir, warp, glint } = stateAt(frame, fps);
    const appearSec = Math.min(time * entrance, APPEAR_DONE);
    const fadeIn = (from: number) => smoothstep(0, 1, (appearSec - from) / (APPEAR_TOTAL - from));
    const grownIn = clamp01(appearSec / APPEAR_TOTAL);
    const scale = zoomFor(grownIn * grownIn * (3 - 2 * grownIn));
    const particleFade = smoothstep(0, 1, (appearSec - APPEAR.stagger) / (APPEAR_TOTAL - APPEAR.stagger));

    const box = size ?? H;
    const sc: Scene = {
      width: W, height: box, unit: Math.min(box, W * 0.8),
      flow: phase, stir, warp: warpBend(warp), restWarp: warpBend(MIN_WARP_LEVEL),
    };
    const cx = W / 2, cy = H / 2;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineJoin = "round";
    ctx.lineCap = "butt";

    // ── A soft light behind it ──
    const glowCol = mixRgb(BRAND, EXTREME, 0.35 * stir);
    const glowGain = (0.29 + 0.04 * stir) * fadeIn(0.6);
    if (glowGain > 0.002) {
      const R = Math.min(W, H) / 2;
      const radial = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      for (let i = 0; i <= 10; i++) {
        const pu = ((i / 10) * R) / (sc.unit * 0.5 * scale);
        radial.addColorStop(i / 10, rgba(glowCol, Math.exp(-pu * pu * 2.2) * smoothstep(1, 0.6, i / 10) * glowGain));
      }
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, W, H);
    }

    // ── The strands ──
    const N = SEGMENTS + 1;
    const xs = Array.from({ length: STRANDS }, () => new Float32Array(N));
    const ys = Array.from({ length: STRANDS }, () => new Float32Array(N));
    const runs: Array<{ strand: number; from: number; to: number; col: Rgb; gain: number }> = [];
    for (let k = 0; k < STRANDS; k++) {
      const f = k / (STRANDS - 1);
      const grown = strandGrown(f, appearSec);
      const apart = (f * 2 - 1) * APPEAR.apart * sc.unit * (1 - grown) * (1 - grown);
      const vCore = 0.35 + 0.65 * Math.sin(f * Math.PI);
      const lit = new Float32Array(N), peaks = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const sv = i / SEGMENTS;
        const st = strandAt(sc, sv, f);
        const [bx, by] = curve(sc, sv);
        const [nx, ny] = normalAt(sv);
        const offset = strandOffset(sc, st, f) + apart;
        xs[k][i] = cx + (bx + nx * offset) * scale;
        ys[k][i] = cy - (by + ny * offset) * scale;
        const g2 = glintAt(sv, f, time) * glint;
        peaks[i] = Math.max(Math.abs(st.w) / 1.04 * sc.warp, g2);
        const weight = Math.min(1, Math.max(3 / STRANDS, mix(st.rest, st.amp, sc.warp) / (STRANDS * 1.2)));
        lit[i] = weight * strandDrawn(sv, f, grown) * (1.16 + 0.06 * stir) * (1 + GLINT.gain * g2) * vCore;
      }
      for (let from = 0; from < SEGMENTS; from += RUN) {
        const to = Math.min(SEGMENTS, from + RUN);
        let gain = 0, peak = 0;
        for (let i = from; i <= to; i++) { gain += lit[i]; peak += peaks[i]; }
        gain /= to - from + 1;
        peak /= to - from + 1;
        if (gain < 0.004) continue;
        const sMid = (from + to) / 2 / SEGMENTS;
        const vT = 1 - Math.abs(2 * sMid - 1) + (f - 0.5) * 0.3;
        const col = mixRgb(ramp3(vT, BRAND_DEEP, BRAND, BRAND_LIGHT), EXTREME, smoothstep(0.5, 1, peak) * (0.25 + 0.75 * stir));
        runs.push({ strand: k, from, to, col, gain });
      }
    }
    const strokeRun = (k: number, from: number, to: number) => {
      ctx.beginPath();
      ctx.moveTo(xs[k][from], ys[k][from]);
      for (let i = from + 1; i <= to; i++) ctx.lineTo(xs[k][i], ys[k][i]);
      ctx.stroke();
    };
    // Every halo first, then every core, so no strand's glow washes over another's line
    ctx.lineWidth = HALO_PX;
    for (const r of runs) { ctx.strokeStyle = rgba(r.col, 0.05 * r.gain / 0.6); strokeRun(r.strand, r.from, r.to); }
    ctx.lineWidth = CORE_PX;
    for (const r of runs) { ctx.strokeStyle = rgba(r.col, r.gain); strokeRun(r.strand, r.from, r.to); }

    // ── Embers lifting off the strands ──
    if (particleFade > 0.01) {
      for (let n = 0; n < PARTICLES; n++) {
        const period = 1.4 + 2 * hash(n * 1.7 + 0.3);
        const t = time / period + hash(n * 3.1);
        const life = fract(t);
        const k = n * 17 + Math.floor(t) * 7.13;
        const sv = hash(k), f = hash(k + 9.1);
        const st = strandAt(sc, sv, f);
        const spread = Math.abs(strandOffset(sc, strandAt(sc, sv, 1), 1) - strandOffset(sc, strandAt(sc, sv, 0), 0));
        const density = 1 / (1 + spread / (0.035 * sc.unit));
        const swing = clamp01(Math.abs(st.w) * sc.warp / 1.04);
        const bright = clamp01(0.6 * density + 0.7 * swing * swing);
        const h = hash(k + 5.5);
        const on = smoothstep(h - 0.12, h + 0.12, 0.12 + 0.88 * bright + 0.25 * stir);
        const fade = smoothstep(0, 0.12, life) * Math.pow(1 - life, 1.4);
        const glow = fade * on * (0.65 + 0.5 * hash(k + 7)) * (0.8 + 0.5 * bright) * (1 + 0.7 * maya) * particleFade;
        if (glow < 0.02) continue;
        const dir = hash(k + 2.1) < 0.75 ? 1 : -1;
        const travel = (0.07 + 0.16 * hash(k + 2.7)) * sc.unit * (0.6 + 0.9 * stir) * (1 + 0.9 * maya);
        const eased = 1 - Math.pow(1 - life, 2);
        const sway = Math.sin(life * 6 + n + time * 0.7) * 0.014 * sc.unit;
        const [x, y] = curve(sc, sv);
        const [nx, ny] = normalAt(sv);
        const out = strandOffset(sc, st, f) + dir * travel * eased;
        const along = (hash(k + 3.3) - 0.5) * 0.06 * sc.unit * eased + sway;
        const px = cx + (x + nx * out + ny * along) * scale;
        const py = cy - (y + ny * out - nx * along) * scale;
        const tint = clamp01(hash(k + 8) * 0.7 + 0.4 * swing);
        const col = mixRgb(mixRgb(BRAND, BRAND_LIGHT, tint), EXTREME, smoothstep(0.55, 1, tint));
        const sz = (3 + 5 * hash(k + 6.1) ** 2) * (1 - 0.35 * life) * mix(1, scale, 0.5) * (1 + 0.25 * maya);
        ctx.fillStyle = rgba(col, 0.35 * glow);
        ctx.beginPath(); ctx.arc(px, py, sz * 0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = rgba(col, 0.8 * glow);
        ctx.beginPath(); ctx.arc(px, py, sz * 0.2, 0, TAU); ctx.fill();
      }
    }
  }, [frame, fps, W, H, entrance, size]);

  return <canvas ref={ref} width={W} height={H} style={{ position: "absolute", inset: 0 }} />;
};
