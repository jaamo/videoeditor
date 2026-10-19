import { Easing } from "remotion";
import type { Box, TimelineEvent } from "../types";

export const W = 1080;
export const H = 1920;

/** Where the camera looks (viewport CSS px) and how much it magnifies (output px per CSS px). */
export type Cam = { cx: number; cy: number; s: number };

const TRANSITION_MS = 900;
/** Capture is 2×, so a little past that still looks sharp. */
const MAX_SCALE = 2.5;
const ease = Easing.bezier(0.65, 0, 0.35, 1);

export function overviewCam(vw: number, vh: number): Cam {
  return { cx: vw / 2, cy: vh / 2, s: W / vw };
}

/** Frame a box: as close as it fits, never tighter than MAX_SCALE, never wider than overview. */
export function camFor(box: Box | null, vw: number, vh: number): Cam {
  const overview = overviewCam(vw, vh);
  if (!box) return overview;
  const s = clamp(Math.min((W * 0.86) / box.width, (H * 0.5) / box.height), overview.s, MAX_SCALE);
  return clampCenter({ cx: box.x + box.width / 2, cy: box.y + box.height / 2, s }, vw, vh);
}

/** Keep the crop inside the screen where the screen is bigger than the crop. */
function clampCenter(c: Cam, vw: number, vh: number): Cam {
  const cw = W / c.s;
  const ch = H / c.s;
  const cx = cw >= vw ? vw / 2 : clamp(c.cx, cw / 2, vw - cw / 2);
  const cy = ch >= vh ? vh / 2 : clamp(c.cy, ch / 2, vh - ch / 2);
  return { cx, cy, s: c.s };
}

type Key = { t: number; target: Cam; from: Cam };

/**
 * Turn camera events into keyframes. Each move starts from wherever the camera actually
 * is at that moment, so a new target mid-transition redirects smoothly instead of jumping.
 */
export function cameraTrack(events: TimelineEvent[], vw: number, vh: number): (ms: number) => Cam {
  const start = overviewCam(vw, vh);
  const keys: Key[] = [];
  for (const e of events) {
    if (e.type !== "camera") continue;
    const target = camFor(e.box, vw, vh);
    const from = e.instant ? target : keys.length ? sample(keys[keys.length - 1], e.t) : start;
    keys.push({ t: e.t, target, from });
  }
  return (ms) => {
    let k: Key | undefined;
    for (const key of keys) if (key.t <= ms) k = key;
    return k ? sample(k, ms) : start;
  };
}

function sample(k: Key, ms: number): Cam {
  const p = ease(clamp((ms - k.t) / TRANSITION_MS, 0, 1));
  return {
    cx: lerp(k.from.cx, k.target.cx, p),
    cy: lerp(k.from.cy, k.target.cy, p),
    // Zoom feels even when interpolated in log space.
    s: Math.exp(lerp(Math.log(k.from.s), Math.log(k.target.s), p)),
  };
}

/** Viewport point → output pixel, through the camera. */
export function project(c: Cam, x: number, y: number) {
  return { x: W / 2 + (x - c.cx) * c.s, y: H / 2 + (y - c.cy) * c.s };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
