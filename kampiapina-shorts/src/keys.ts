// Kdenlive's Transform effect (MLT's qtblend): where a clip's picture goes, as a rect that
// can move. Read from the project by Node, and played back frame by frame by Remotion, so
// what's in Kdenlive is what's rendered. Pure: no Node, no DOM.
//
// MLT writes an animation as "0=-1167 0 3413 1920 1;30i=…": a keyframe at each frame (or
// clock time), its value "x y w h opacity" in the project's pixels, and before "=" how it
// moves on to the next keyframe (none: linear, "|": holds, "i": cubic ease in and out, …).
// The picture keeps its shape: it's fitted inside the rect and centred in it.

export type Rect = [x: number, y: number, w: number, h: number, opacity: number];
export type Key = { f: number; type: string; rect: Rect };

/** Frames, or a clock time ("00:00:01.500", or "00:00:01:15" with frames last). */
function frameOf(pos: string, fps: number, length: number): number {
  let f: number;
  const parts = pos.split(":").map(Number);
  if (parts.length === 1) f = Math.round(parts[0]);
  else if (parts.length === 4) f = Math.round(((parts[0] * 60 + parts[1]) * 60 + parts[2]) * fps) + parts[3];
  else f = Math.round(parts.reduce((t, p) => t * 60 + p, 0) * fps);
  // A negative time counts from the end.
  return f < 0 ? length + f : f;
}

/** An animated rect as MLT writes it. `size` is the frame's, for values written in %. */
export function parseRect(anim: string, o: { fps: number; length: number; size: { w: number; h: number } }): Key[] {
  const value = (v: string): Rect => {
    const n = v.trim().split(/\s+/).map((x, i) => (x.endsWith("%") ? (parseFloat(x) / 100) * (i % 2 === 0 ? o.size.w : o.size.h) : parseFloat(x)));
    return [n[0] ?? 0, n[1] ?? 0, n[2] ?? o.size.w, n[3] ?? o.size.h, Number.isFinite(n[4]) ? n[4] : 1];
  };
  const keys: Key[] = [];
  for (const part of anim.split(";").map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(-?[\d:.]+)([^\d:.=]?)=(.*)$/);
    if (!m) keys.push({ f: 0, type: "", rect: value(part) });
    else keys.push({ f: frameOf(m[1], o.fps, o.length), type: m[2], rect: value(m[3]) });
  }
  return keys.sort((a, b) => a.f - b.f);
}

/** Back to MLT's text: frames, rounded pixels. */
export function writeRect(keys: Key[]): string {
  const r = (k: Key) => `${Math.round(k.rect[0])} ${Math.round(k.rect[1])} ${Math.round(k.rect[2])} ${Math.round(k.rect[3])} ${k.rect[4].toFixed(6)}`;
  return keys.map((k) => `${k.f}${k.type}=${r(k)}`).join(";");
}

/** The rect at frame `f` (from the clip's start). */
export function rectAt(keys: Key[], f: number): Rect {
  if (!keys.length) throw new Error("no keyframes");
  const i = keys.findLastIndex((k) => k.f <= f);
  if (i < 0) return keys[0].rect;
  if (i === keys.length - 1) return keys[i].rect;
  const a = keys[i];
  const b = keys[i + 1];
  if (a.type === "|") return a.rect;
  const t = Math.min(1, Math.max(0, (f - a.f) / Math.max(1, b.f - a.f)));
  if (a.type === "~" || a.type === "$" || a.type === "-") {
    // MLT's smooth types are Catmull-Rom splines through the keyframes around.
    const p0 = keys[Math.max(0, i - 1)].rect;
    const p3 = keys[Math.min(keys.length - 1, i + 2)].rect;
    return a.rect.map((p1, c) => catmull(p0[c], p1, b.rect[c], p3[c], t)) as Rect;
  }
  const e = ease(a.type, t);
  return a.rect.map((v, c) => v + (b.rect[c] - v) * e) as Rect;
}

const catmull = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);

/**
 * MLT's easing, by its letter: a–c sinusoidal, d–f quadratic, g–i cubic, j–l quartic,
 * m–o quintic, p–r exponential, s–u circular, v–x back (each in, out, in-out). The rest
 * (elastic, bounce) are played as cubic in-out.
 */
export function ease(type: string, t: number): number {
  const families: Record<string, (t: number) => number> = {
    sin: (x) => 1 - Math.cos((x * Math.PI) / 2),
    quad: (x) => x ** 2,
    cubic: (x) => x ** 3,
    quart: (x) => x ** 4,
    quint: (x) => x ** 5,
    expo: (x) => (x === 0 ? 0 : 2 ** (10 * x - 10)),
    circ: (x) => 1 - Math.sqrt(1 - x * x),
    back: (x) => 2.70158 * x ** 3 - 1.70158 * x ** 2,
  };
  const order = ["sin", "quad", "cubic", "quart", "quint", "expo", "circ", "back"];
  const k = "abcdefghijklmnopqrstuvwx".indexOf(type);
  if (type === "") return t;
  if (k < 0) return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  const fn = families[order[Math.floor(k / 3)]];
  const mode = k % 3;
  if (mode === 0) return fn(t);
  if (mode === 1) return 1 - fn(1 - t);
  return t < 0.5 ? fn(2 * t) / 2 : 1 - fn(2 - 2 * t) / 2;
}

/** Where a picture of `src` size is drawn for a rect: fitted inside it, centred. */
export function placeIn(rect: Rect, src: { width: number; height: number }) {
  const k = Math.min(rect[2] / src.width, rect[3] / src.height);
  const w = src.width * k;
  const h = src.height * k;
  return { left: rect[0] + (rect[2] - w) / 2, top: rect[1] + (rect[3] - h) / 2, width: w, height: h, opacity: rect[4], scale: k };
}
