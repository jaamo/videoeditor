// Two cameras on one shoot: where a b-roll clip's sound sits in the A-roll (the clock offset
// between the cameras), and whether its words are in the A-roll's transcript (the same
// moment from a second angle) or not (talk the A-roll doesn't have).
import { ff } from "./media.ts";
import type { Word } from "../types.ts";

/** Seconds per envelope sample. */
export const ENVELOPE_STEP = 0.05;

/** A file's sound as log-energy every ENVELOPE_STEP, mean removed: what correlates between two cameras hearing the same thing. */
export async function envelope(file: string): Promise<Float64Array> {
  const chunks: Buffer[] = [];
  await ff(["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], (c) => chunks.push(c));
  const buf = Buffer.concat(chunks);
  const per = Math.round(8000 * ENVELOPE_STEP);
  const out = new Float64Array(Math.floor(buf.length / 2 / per));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let k = 0; k < per; k++) {
      const v = buf.readInt16LE((i * per + k) * 2);
      s += v * v;
    }
    out[i] = Math.log10(s / per + 1);
  }
  let mean = 0;
  for (const v of out) mean += v;
  mean /= out.length || 1;
  for (let i = 0; i < out.length; i++) out[i] -= mean;
  return out;
}

/** Where `b` fits best inside the longer `a`: the lag (samples) with the highest normalized correlation, tried every `step` samples. */
export function bestLag(b: Float64Array, a: Float64Array, step = 2): { corr: number; lag: number } {
  const nb = b.length;
  let eb = 0;
  for (const v of b) eb += v * v;
  eb = Math.sqrt(eb) || 1;
  let best = { corr: -2, lag: 0 };
  for (let lag = 0; lag + nb <= a.length; lag += step) {
    let dot = 0;
    let ea = 0;
    for (let i = 0; i < nb; i++) {
      const x = a[lag + i];
      dot += b[i] * x;
      ea += x * x;
    }
    const c = dot / (eb * (Math.sqrt(ea) || 1));
    if (c > best.corr) best = { corr: c, lag };
  }
  return best;
}

/** The `n` best places `b` fits in `a`, at least `minGap` samples apart: a short clip's single best peak is often noise, the true one recurs across clips. */
export function topLags(b: Float64Array, a: Float64Array, n = 3, minGap = 200, step = 2): { corr: number; lag: number }[] {
  const nb = b.length;
  let eb = 0;
  for (const v of b) eb += v * v;
  eb = Math.sqrt(eb) || 1;
  const corr: { corr: number; lag: number }[] = [];
  for (let lag = 0; lag + nb <= a.length; lag += step) {
    let dot = 0;
    let ea = 0;
    for (let i = 0; i < nb; i++) {
      const x = a[lag + i];
      dot += b[i] * x;
      ea += x * x;
    }
    corr.push({ corr: dot / (eb * (Math.sqrt(ea) || 1)), lag });
  }
  corr.sort((x, y) => y.corr - x.corr);
  const out: { corr: number; lag: number }[] = [];
  for (const c of corr) {
    if (out.some((o) => Math.abs(o.lag - c.lag) < minGap)) continue;
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

/** The normalized correlation of `b` with `a` at one lag (samples); NaN when `b` doesn't fit there. */
export function corrAt(b: Float64Array, a: Float64Array, lag: number): number {
  const nb = b.length;
  if (lag < 0 || lag + nb > a.length) return NaN;
  let dot = 0, ea = 0, eb = 0;
  for (let i = 0; i < nb; i++) {
    const x = a[lag + i];
    dot += b[i] * x;
    ea += x * x;
    eb += b[i] * b[i];
  }
  return dot / ((Math.sqrt(ea) || 1) * (Math.sqrt(eb) || 1));
}

/** The best correlation within ±`around` samples of a lag (a file's time stamp is rounded to the second, so each pair may be off by one): NaN when `b` fits nowhere there. */
export function corrNear(b: Float64Array, a: Float64Array, lag: number, around = 30, step = 2): { corr: number; lag: number } {
  let best = { corr: NaN, lag };
  for (let l = lag - around; l <= lag + around; l += step) {
    const c = corrAt(b, a, l);
    if (!Number.isNaN(c) && (Number.isNaN(best.corr) || c > best.corr)) best = { corr: c, lag: l };
  }
  return best;
}

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** How much of a clip's talk is said, in order, somewhere in another transcript: the best window's share of matching words, and where it starts (index of the first word). */
export function wordsMatch(b: Word[], a: Word[]): { ratio: number; at: number } {
  const bw = b.map((w) => norm(w.text)).filter(Boolean);
  const aw = a.map((w) => norm(w.text));
  if (bw.length < 4 || aw.length < bw.length) return { ratio: 0, at: 0 };
  const win = Math.round(bw.length * 1.5);
  let best = { ratio: 0, at: 0 };
  for (let i = 0; i + bw.length <= aw.length; i++) {
    const slice = aw.slice(i, i + win);
    let j = 0;
    let hits = 0;
    for (const w of bw) {
      const k = slice.indexOf(w, j);
      if (k >= 0) {
        hits++;
        j = k + 1;
      }
    }
    const ratio = hits / bw.length;
    if (ratio > best.ratio) best = { ratio, at: i };
  }
  return best;
}
