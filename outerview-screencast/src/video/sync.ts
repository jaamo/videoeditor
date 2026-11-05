// Lining up two recordings of the same talk (camera and screen) by their sound.
import { pcm } from "./media.ts";

/** Loudness is compared every this many ms: fine enough, a third of a frame. */
const STEP_MS = 10;

/**
 * Where `other` starts, in ms of `main`'s time (negative: it started first), and how sure
 * that is: how far the best match stands out from all the others, in standard deviations
 * of them. Over 8 is clear; under 5, look.
 */
export async function offsetOf(main: string, other: string): Promise<{ startMs: number; confidence: number }> {
  const [a, b] = await Promise.all([envelope(main), envelope(other)]);
  let n = 1;
  while (n < a.length + b.length) n *= 2;
  const fa = fft(pad(a, n));
  const fb = fft(pad(b, n));
  // Cross-correlation: a ⋆ b = IFFT(FA · conj(FB))
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    re[i] = fa.re[i] * fb.re[i] + fa.im[i] * fb.im[i];
    im[i] = fa.im[i] * fb.re[i] - fa.re[i] * fb.im[i];
  }
  const corr = ifft(re, im);
  // corr[k]: a[t] against b[t - k], so `other` starts at k (wrapped for negative).
  let best = 0;
  for (let k = 1; k < n; k++) if (corr[k] > corr[best]) best = k;
  let mean = 0;
  for (let k = 0; k < n; k++) mean += corr[k];
  mean /= n;
  let sd = 0;
  for (let k = 0; k < n; k++) sd += (corr[k] - mean) ** 2;
  sd = Math.sqrt(sd / n) || 1;
  const lag = best > n / 2 ? best - n : best;
  return { startMs: lag * STEP_MS, confidence: (corr[best] - mean) / sd };
}

/** Loudness every STEP_MS, log-scaled, around zero: speech's shape, whatever the mic. */
async function envelope(file: string): Promise<Float64Array> {
  const rate = 8000;
  const s = await pcm(file, rate);
  const step = (rate * STEP_MS) / 1000;
  const out = new Float64Array(Math.floor(s.length / step));
  for (let f = 0; f < out.length; f++) {
    let sum = 0;
    for (let i = f * step; i < (f + 1) * step; i++) sum += s[i] * s[i];
    out[f] = Math.log10(sum / step + 1);
  }
  const mean = out.reduce((x, y) => x + y, 0) / out.length;
  let sd = 0;
  for (let i = 0; i < out.length; i++) sd += (out[i] - mean) ** 2;
  sd = Math.sqrt(sd / out.length) || 1;
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - mean) / sd;
  return out;
}

function pad(x: Float64Array, n: number) {
  const out = new Float64Array(n);
  out.set(x);
  return out;
}

function fft(x: Float64Array) {
  const re = Float64Array.from(x);
  const im = new Float64Array(x.length);
  transform(re, im, false);
  return { re, im };
}

function ifft(re: Float64Array, im: Float64Array) {
  transform(re, im, true);
  return re;
}

/** In-place radix-2 FFT (inverse scaled by 1/n). */
function transform(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) re[i] /= n;
}
