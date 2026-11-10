// A video project, as the agents and the scripts share it: everything is a file in
// projects/<name>/, so any step can be read, changed by hand, or done again on its own.
//
//   project.yaml        language, music, spelling fixes for the captions
//   footage/            the recordings: a face camera (vertical) and/or a screen recording
//   analysis/           what the analyzer found: transcript, voice, screen events, contact sheets
//   titles.yaml         the opening title and the end card's line
//   plan.yaml           the edit: which pieces, in what layout, with which zooms
//   <name>.kdenlive     the draft of the plan, fixed by hand in Kdenlive; the render's cut (and .ass, its captions)
//   review/             the reviewer's checks of out.mp4
//   tmp/                everything else made along the way
//   out.mp4, sample.mp4
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { EditLayout, EditManifest, Word } from "../types.ts";
import { applyReplacements } from "../screencast/edit.ts";
import type { Probe } from "./media.ts";
import type { Box } from "./screen.ts";

export const FPS = 30;
const VIDEO = /\.(mp4|mkv|mov|webm|avi|m4v)$/i;

export function paths(name: string) {
  const dir = path.resolve("projects", name);
  const a = (f: string) => path.join(dir, "analysis", f);
  return {
    dir,
    settings: path.join(dir, "project.yaml"),
    footage: path.join(dir, "footage"),
    analysis: path.join(dir, "analysis"),
    summary: a("summary.json"),
    voice: a("voice.wav"),
    transcript: a("transcript.json"),
    transcriptText: a("transcript.txt"),
    cuts: a("cuts.json"),
    screenEvents: a("screen-events.json"),
    sheets: a("sheets"),
    frames: a("frames"),
    findings: a("findings.md"),
    titles: path.join(dir, "titles.yaml"),
    plan: path.join(dir, "plan.yaml"),
    /** The draft in Kdenlive: the cut to fix by hand, read back by the render. */
    kdenlive: path.join(dir, `${name}.kdenlive`),
    /** Its Subtitles track: the captions, fixed in Kdenlive, drawn by the render. */
    subtitles: path.join(dir, `${name}.kdenlive.ass`),
    /** Kdenlive's proxies of the footage (the render uses the originals). */
    proxy: path.join(dir, "proxy"),
    review: path.join(dir, "review"),
    tmp: path.join(dir, "tmp"),
    out: path.join(dir, "out.mp4"),
    sample: path.join(dir, "sample.mp4"),
  };
}
export type Paths = ReturnType<typeof paths>;

export type Settings = { language?: string; music?: string; musicVolume?: number; replace?: Record<string, string> };

export type Source = Probe & { file: string };
/** A recording in the project: where it starts in the main one's time, and how that's known. */
export type Placed = Source & { startMs: number; synced: "main" | "sound" | "assumed"; syncConfidence?: number };
export type Summary = {
  /** The recording whose time everything is in, and whose sound is the voice: the face camera's if it has sound. */
  main: "face" | "screen";
  durationMs: number;
  face?: Placed;
  screen?: Placed;
  inputs: Record<string, string>;
};

/** `opening: false` leaves the opening title card out (the title is still the video's name). */
export type Titles = { title: string; subtitle?: string; endLine?: string; opening?: boolean };

/** Seconds, as 83.4 or "1:23.4". */
type Time = number | string;
export type PlanZoom = { at: Time; until: Time; box: Box; why?: string };
/** `text`: the captions as said, when the transcript has them wrong; spread over the segment's words. */
/** `sound: screen`: this piece's sound is the screen recording's (what the computer played, like Maya), not the voice. */
export type PlanSegment = { from: Time; to: Time; layout: EditLayout; why?: string; zooms?: PlanZoom[]; text?: string; sound?: "screen" };
export type Plan = { segments: PlanSegment[]; replace?: Record<string, string>; musicVolume?: number };

/** The recordings in footage/: a vertical one is the face, a landscape one the screen (or by name). */
export function footageOf(p: Paths, probeOf: (f: string) => Probe) {
  const files = existsSync(p.footage) ? readdirSync(p.footage).filter((f) => VIDEO.test(f)).sort() : [];
  let face: Source | undefined;
  let screen: Source | undefined;
  for (const f of files) {
    const file = path.join(p.footage, f);
    const pr = { ...probeOf(file), file };
    const kind = /face|camera|cam|kasvo|puhuja/i.test(f) ? "face" : /screen|ruutu|näyttö/i.test(f) ? "screen" : pr.height > pr.width ? "face" : "screen";
    if (kind === "face") {
      if (face) throw new Error(`Two face recordings in footage/: ${path.basename(face.file)} and ${f}. Name them (…face… / …screen…)`);
      face = pr;
    } else {
      if (screen) throw new Error(`Two screen recordings in footage/: ${path.basename(screen.file)} and ${f}. Name them (…face… / …screen…)`);
      screen = pr;
    }
  }
  return { face, screen };
}

export const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;
export const readYaml = async <T>(file: string): Promise<T> => YAML.parse(await readFile(file, "utf8")) as T;

export function seconds(t: Time): number {
  if (typeof t === "number") return t;
  const m = String(t).trim().match(/^(?:(\d+):)?(\d+(?:[.,]\d+)?)$/);
  if (!m) throw new Error(`Not a time: "${t}" (use 83.4 or "1:23.4")`);
  return Number(m[1] ?? 0) * 60 + Number(m[2].replace(",", "."));
}
const msOf = (t: Time) => Math.round(seconds(t) * 1000);

export const clock = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};

export type Problem = { level: "error" | "warning"; where: string; what: string };

/** At a cut, the voice this loud or more is heard being cut (speech is about -20 dBFS, quiet under -45). */
export const LOUD_AT_CUT_DB = -38;

/**
 * What's wrong with a plan, before rendering it: errors stop a render, warnings are for a look.
 * With the voice's `level` (dBFS at a ms), a cut is judged by what's heard there; without it,
 * by Whisper's word times, which run late at a word's start and stretch over pauses.
 */
export function checkPlan(plan: Plan, summary: Summary, words: Word[], level?: (ms: number) => number): Problem[] {
  const out: Problem[] = [];
  const err = (where: string, what: string) => out.push({ level: "error", where, what });
  const warn = (where: string, what: string) => out.push({ level: "warning", where, what });
  if (!plan?.segments?.length) {
    err("plan", "no segments");
    return out;
  }
  const kept: [number, number][] = [];
  plan.segments.forEach((s, i) => {
    const where = `segment ${i + 1}`;
    let from: number, to: number;
    try {
      from = msOf(s.from);
      to = msOf(s.to);
    } catch (e) {
      err(where, (e as Error).message);
      return;
    }
    if (to <= from) err(where, `ends (${clock(to)}) before it starts (${clock(from)})`);
    if (from < 0 || to > summary.durationMs + 50) err(where, `outside the recording (0:00.0–${clock(summary.durationMs)})`);
    if (to - from < 400) warn(where, `only ${to - from} ms long`);
    if (s.layout !== "face" && s.layout !== "screen") err(where, `layout "${s.layout}": use face or screen`);
    if (s.layout === "face" && !summary.face) err(where, "layout face, but there's no face recording");
    if (s.layout === "screen" && !summary.screen) err(where, "layout screen, but there's no screen recording");
    if (s.sound !== undefined && s.sound !== "screen") err(where, `sound "${s.sound}": only screen (or leave it out for the voice)`);
    if (s.sound === "screen") {
      const sc = summary.screen;
      if (!sc?.hasAudio || summary.main === "screen") err(where, "sound screen needs a screen recording with sound, besides the main one");
      else if (from - sc.startMs < 0 || to - sc.startMs > sc.durationMs) err(where, "sound screen, but the screen recording doesn't cover this piece");
    }
    // Both are seen in a screen segment (the face in its corner); the face alone in a face one.
    const seen = s.layout === "screen" ? [summary.screen, summary.face] : [summary.face];
    for (const r of seen) {
      if (!r || from - r.startMs >= 0 && to - r.startMs <= r.durationMs + 50) continue;
      err(where, `the ${r === summary.face ? "face" : "screen"} recording runs only ${clock(r.startMs)}–${clock(r.startMs + r.durationMs)}`);
    }
    // A cut through sound is heard.
    for (const [edge, label] of [[from, "starts"], [to, "ends"]] as const) {
      const w = words.find((w) => w.startMs + 40 < edge && w.endMs - 40 > edge);
      if (level) {
        const db = level(edge);
        if (db > LOUD_AT_CUT_DB) warn(where, `${label} where the voice is loud (${Math.round(db)} dB at ${seconds(edge / 1000).toFixed(2)})${w ? `, in "${w.text}"` : ""}: move it to quiet (npm run video -- level)`);
      } else if (w) warn(where, `${label} in the middle of "${w.text}" (${clock(w.startMs)}–${clock(w.endMs)})`);
    }
    for (const [a, b] of kept) if (from < b - 100 && to > a + 100) warn(where, `repeats ${clock(Math.max(a, from))}–${clock(Math.min(b, to))}, also in an earlier segment`);
    kept.push([from, to]);
    (s.zooms ?? []).forEach((z, k) => {
      const zw = `${where}, zoom ${k + 1}`;
      if (s.layout !== "screen") err(zw, "zooms are on the screen: this segment is face");
      let at: number, until: number;
      try {
        at = msOf(z.at);
        until = msOf(z.until);
      } catch (e) {
        err(zw, (e as Error).message);
        return;
      }
      if (at < from || until > to + 50 || until <= at) err(zw, `must be inside its segment (${clock(from)}–${clock(to)}), and end after it starts`);
      if (until - at < 1200) warn(zw, "shorter than 1.2 s: it barely settles before going back");
      const sc = summary.screen;
      const b = z.box;
      if (!Array.isArray(b) || b.length !== 4 || b.some((v) => typeof v !== "number")) err(zw, "box must be [x, y, width, height] in the screen recording's pixels");
      else if (sc && (b[0] < 0 || b[1] < 0 || b[0] + b[2] > sc.width + 2 || b[1] + b[3] > sc.height + 2)) err(zw, `box goes off the screen (${sc.width}×${sc.height})`);
      else if (sc && b[2] > sc.width * 0.8 && b[3] > sc.height * 0.8) warn(zw, "box is nearly the whole screen: hardly a zoom");
      else if (sc && summary.face) {
        const hidden = underFace(b, sc, summary.face);
        if (hidden > 0.1) warn(zw, `the face's corner covers ${Math.round(hidden * 100)}% of the box once zoomed: pick another box, or no zoom`);
      }
    });
  });
  return out;
}

/**
 * How much of a zoom's box the face's corner covers, once zoomed, as Edit.tsx frames it
 * (1920×1080; the face 400 px tall, 40 px in from the bottom left).
 */
function underFace(b: Box, screen: { width: number; height: number }, face: { width: number; height: number }): number {
  const W = 1920, H = 1080;
  const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const base = Math.min(W / screen.width, H / screen.height);
  const s = clampTo(Math.min((0.8 * W) / (b[2] * base), (0.75 * H) / (b[3] * base)), 1, 2.2);
  const k = base * s;
  const cx = clampTo(b[0] + b[2] / 2, W / k / 2, screen.width - W / k / 2);
  const cy = clampTo(b[1] + b[3] / 2, H / k / 2, screen.height - H / k / 2);
  const x0 = W / 2 + (b[0] - cx) * k, y0 = H / 2 + (b[1] - cy) * k;
  const x1 = x0 + b[2] * k, y1 = y0 + b[3] * k;
  const pw = (400 * face.width) / face.height;
  const px = 40, py = H - 40 - 400;
  const ix = Math.max(0, Math.min(x1, px + pw) - Math.max(x0, px));
  const iy = Math.max(0, Math.min(y1, H - 40) - Math.max(y0, py));
  return (ix * iy) / ((x1 - x0) * (y1 - y0));
}

/** The plan as Remotion renders it: everything in ms of the cut. */
export function manifestOf(o: {
  plan: Plan; summary: Summary; titles: Titles; settings: Settings; words: Word[];
  published: { face?: string; screen?: string; voice: string; screenSound?: string; music?: string };
}): EditManifest {
  const { plan, summary, titles, settings } = o;
  let at = 0;
  const segments: EditManifest["segments"] = [];
  const zooms: EditManifest["zooms"] = [];
  let words: Word[] = [];
  const ranges = plan.segments.map((s) => [msOf(s.from), msOf(s.to)] as const);
  const home = homeSegments(o.words, ranges);
  for (const [i, s] of plan.segments.entries()) {
    const [from, to] = ranges[i];
    segments.push({ atMs: at, fromMs: from, durationMs: to - from, layout: s.layout, ...(s.sound === "screen" ? { sound: "screen" as const } : {}) });
    const own = o.words.filter((_, k) => home[k] === i).map((w) => ({ text: w.text, startMs: at + Math.max(0, w.startMs - from), endMs: at + Math.min(to - from, w.endMs - from) }));
    if (s.text?.trim()) {
      // Written by hand: over the time the transcript's words took (or the segment), each word by its length.
      const tokens = s.text.trim().split(/\s+/);
      const start = own[0]?.startMs ?? at + 100;
      const end = own.at(-1)?.endMs ?? at + to - from - 200;
      const total = tokens.reduce((n, t) => n + t.length + 1, 0);
      let t = start;
      for (const text of tokens) {
        const d = ((end - start) * (text.length + 1)) / total;
        words.push({ text, startMs: Math.round(t), endMs: Math.round(t + d) });
        t += d;
      }
    } else words.push(...own);
    for (const z of s.zooms ?? []) zooms.push({ atMs: at + msOf(z.at) - from, untilMs: at + Math.min(msOf(z.until), to) - from, box: z.box });
    at += to - from;
  }
  words = applyReplacements(words, { ...settings.replace, ...plan.replace });
  return {
    fps: FPS,
    title: titles.title,
    opening: titles.opening,
    subtitle: titles.subtitle,
    endLine: titles.endLine,
    face: summary.face && o.published.face ? { src: o.published.face, width: summary.face.width, height: summary.face.height, startMs: summary.face.startMs } : undefined,
    screen: summary.screen && o.published.screen
      ? { src: o.published.screen, width: summary.screen.width, height: summary.screen.height, startMs: summary.screen.startMs }
      : undefined,
    voice: o.published.voice,
    screenSound: o.published.screenSound,
    music: o.published.music,
    musicVolume: plan.musicVolume ?? settings.musicVolume ?? 0.1,
    segments,
    zooms,
    cutMs: at,
    words,
  };
}

/**
 * For each word, the segment its captions go with: the one holding most of it, or none if
 * it's cut out entirely. Whisper stretches a word over a pause sometimes (typing while
 * talking), so a word cut in two at a pause keeps its caption.
 */
export function homeSegments(words: Word[], ranges: readonly (readonly [number, number])[]): (number | undefined)[] {
  return words.map((w) => {
    let best: number | undefined;
    let most = 0;
    ranges.forEach(([from, to], i) => {
      // A word Whisper gives no length still belongs where it is.
      const overlap = Math.min(to, Math.max(w.endMs, w.startMs + 1)) - Math.max(from, w.startMs);
      if (overlap > most) [best, most] = [i, overlap];
    });
    return best;
  });
}

/** The transcript as lines a person (or an agent) reads: a phrase each, with its times. */
export function transcriptText(words: Word[]): string {
  const lines: string[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) lines.push(`[${(cur[0].startMs / 1000).toFixed(2)}–${(cur.at(-1)!.endMs / 1000).toFixed(2)}] ${cur.map((w) => w.text).join(" ")}`);
    cur = [];
  };
  for (const w of words) {
    if (cur.length && w.startMs - cur.at(-1)!.endMs > 700) flush();
    cur.push(w);
    if (/[.!?]$/.test(w.text) || cur.length >= 18) flush();
  }
  flush();
  return `${lines.join("\n")}\n`;
}
