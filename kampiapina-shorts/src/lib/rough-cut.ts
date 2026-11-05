// The first cut of a recording, before it's fine-tuned by hand: its silences left out, and
// what went wrong while talking (a sentence said again, a false start, an "öö" on its own).
import { readFile } from "node:fs/promises";
import type { Word } from "../types.ts";

/** A pause longer than this is cut out. */
const SILENCE_MS = 1000;
/** Kept around speech, so words aren't clipped. */
const PAD_BEFORE_MS = 150;
const PAD_AFTER_MS = 300;
/** Shorter than this, a piece is a click or a breath: dropped. */
const MIN_PIECE_MS = 250;
/** A phrase said again within this many phrases and this long counts as a retake. */
const RETAKE_LOOKAHEAD = 2;
const RETAKE_WITHIN_MS = 10_000;
const RETAKE_SIMILARITY = 0.7;
const FILLERS = new Set(["öö", "ööö", "öhm", "ömm", "äää", "ää", "eee", "ee", "hmm", "mm", "mmm", "um", "umm", "uh", "uhm", "eh", "ah"]);
const FRAME_MS = 10;
const SMOOTH_MS = 100;

export type Range = { fromMs: number; toMs: number };
export type Removed = Range & { why: string };

/**
 * What to keep of a recording, in ms of it: where its voice (a 16-bit mono WAV) is heard,
 * less the retakes the transcript shows. Also what was taken out, and why, to check by hand.
 */
export async function roughCut(voiceWav: string, words: Word[]): Promise<{ keep: Range[]; removed: Removed[] }> {
  const level = await levels(voiceWav);
  const removed: Removed[] = [];

  // Where there's sound: speech with its short pauses, padded.
  const sorted = [...level].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)];
  const loud = sorted[Math.floor(sorted.length * 0.95)];
  const threshold = floor + 0.3 * (loud - floor);
  let keep: Range[] = [];
  let start = -1;
  let lastLoud = -Infinity;
  for (let i = 0; i < level.length; i++) {
    const ms = i * FRAME_MS;
    if (level[i] < threshold) continue;
    if (start < 0) start = ms;
    else if (ms - lastLoud > SILENCE_MS) {
      keep.push({ fromMs: start, toMs: lastLoud + FRAME_MS });
      start = ms;
    }
    lastLoud = ms;
  }
  if (start >= 0) keep.push({ fromMs: start, toMs: lastLoud + FRAME_MS });
  const end = level.length * FRAME_MS;
  keep = keep.map((r) => ({ fromMs: Math.max(0, r.fromMs - PAD_BEFORE_MS), toMs: Math.min(end, r.toMs + PAD_AFTER_MS) }));
  for (const [i, r] of keep.entries()) {
    const from = i === 0 ? 0 : keep[i - 1].toMs;
    if (r.fromMs - from >= SILENCE_MS) removed.push({ fromMs: from, toMs: r.fromMs, why: "silence" });
  }

  // What was said again: take out the first go, from where it starts to where the next starts.
  const quiet = (ms: number) => quietest(level, ms - 200, ms + 50);
  const phrases = phrasesOf(words);
  for (const [i, p] of phrases.entries()) {
    if (p.tokens.length && p.tokens.every((t) => FILLERS.has(t))) {
      removed.push({ fromMs: quiet(p.startMs), toMs: quiet(p.endMs + 150), why: `filler: ${p.text}` });
      continue;
    }
    for (let j = i + 1; j <= i + RETAKE_LOOKAHEAD && j < phrases.length; j++) {
      const q = phrases[j];
      if (q.startMs - p.endMs > RETAKE_WITHIN_MS) break;
      if (isRetake(p.tokens, q.tokens)) {
        removed.push({ fromMs: quiet(p.startMs), toMs: quiet(q.startMs), why: `said again: ${p.text}` });
        break;
      }
    }
  }

  for (const r of removed.filter((r) => r.why !== "silence")) keep = subtract(keep, r);
  keep = keep.filter((r) => r.toMs - r.fromMs >= MIN_PIECE_MS);
  return { keep, removed: removed.sort((a, b) => a.fromMs - b.fromMs) };
}

type Phrase = { startMs: number; endMs: number; text: string; tokens: string[] };

/** Words in phrases: up to a comma or full stop, or a pause. */
function phrasesOf(words: Word[]): Phrase[] {
  const out: Phrase[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    const text = cur.map((w) => w.text).join(" ");
    out.push({ startMs: cur[0].startMs, endMs: cur.at(-1)!.endMs, text, tokens: cur.map((w) => normal(w.text)).filter(Boolean) });
    cur = [];
  };
  for (const w of words) {
    if (cur.length && w.startMs - cur.at(-1)!.endMs > 600) flush();
    cur.push(w);
    if (/[.,!?;:]$/.test(w.text)) flush();
  }
  flush();
  return out;
}

const normal = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** `a` started over as `b`: `b` begins with it, or is nearly the same words. */
function isRetake(a: string[], b: string[]): boolean {
  if (a.length >= 2 && a.length <= b.length && a.every((t, k) => b[k] === t)) return true;
  if (a.length < 3) return false;
  return lcs(a, b) / Math.max(a.length, b.length) >= RETAKE_SIMILARITY;
}

function lcs(a: string[], b: string[]): number {
  const row = new Array(b.length + 1).fill(0);
  for (const x of a) {
    let diag = 0;
    for (let k = 1; k <= b.length; k++) {
      const up = row[k];
      row[k] = x === b[k - 1] ? diag + 1 : Math.max(row[k], row[k - 1]);
      diag = up;
    }
  }
  return row[b.length];
}

function subtract(keep: Range[], cut: Range): Range[] {
  return keep.flatMap((r) => {
    if (cut.toMs <= r.fromMs || cut.fromMs >= r.toMs) return [r];
    return [
      { fromMs: r.fromMs, toMs: cut.fromMs },
      { fromMs: cut.toMs, toMs: r.toMs },
    ].filter((p) => p.toMs > p.fromMs);
  });
}

/** The quietest moment between two times: where a cut is heard least. */
function quietest(level: Float32Array, fromMs: number, toMs: number): number {
  let best = Math.max(0, Math.round(fromMs / FRAME_MS));
  for (let i = best; i <= Math.min(level.length - 1, Math.round(toMs / FRAME_MS)); i++) if (level[i] < level[best]) best = i;
  return best * FRAME_MS;
}

/**
 * The loudness of a 16-bit mono WAV, in dB, every FRAME_MS: averaged over SMOOTH_MS, so a
 * click in a pause doesn't count as sound, and a stop inside a word doesn't count as a pause.
 */
async function levels(wav: string): Promise<Float32Array> {
  const buf = await readFile(wav);
  const rate = buf.readUInt32LE(24);
  const data = buf.indexOf("data", 12, "ascii");
  const pcm = new Int16Array(Buffer.from(buf.subarray(data + 8)).buffer);
  const step = Math.round((rate * FRAME_MS) / 1000);
  const power = new Float64Array(Math.floor(pcm.length / step));
  for (let f = 0; f < power.length; f++) {
    let sum = 0;
    for (let i = f * step; i < (f + 1) * step; i++) sum += pcm[i] * pcm[i];
    power[f] = sum / step;
  }
  const half = Math.round(SMOOTH_MS / FRAME_MS / 2);
  const out = new Float32Array(power.length);
  for (let f = 0; f < power.length; f++) {
    let sum = 0;
    const from = Math.max(0, f - half);
    const to = Math.min(power.length - 1, f + half);
    for (let k = from; k <= to; k++) sum += power[k];
    out[f] = 10 * Math.log10(sum / (to - from + 1) + 1);
  }
  return out;
}
