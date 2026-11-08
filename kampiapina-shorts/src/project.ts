// A short, as the agents, the scripts and Kdenlive share it: everything is a file in
// projects/<name>/, so any step can be read, changed by hand, or done again on its own.
//
//   project.yaml        language, music, the grade, spelling fixes for the captions
//   footage/            the camera (one file), and b-roll/ and screen/ clips to cut in
//   analysis/           what the analyzer found: voice, transcript, contact sheets
//   plan.yaml           the first cut, as the planner decided it
//   <name>.kdenlive     the cut: made from the plan, then fixed by hand. From here on, the truth
//   <name>.kdenlive.ass the captions: its Subtitles track, their text and timing fixed in Kdenlive
//   proxy/              Kdenlive's small copies of the footage, to edit with smoothly
//   review/, review.md  the reviewer's checks of out.mp4
//   tmp/                everything else made along the way
//   out.mp4, sample.mp4
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { parseRect, type Key, type Rect } from "./keys.ts";
import { Project, prop, type Filter, type XmlNode } from "./lib/kdenlive-xml.ts";
import type { Probe } from "./lib/media.ts";
import type { Word } from "./types.ts";

/** The short: vertical, full HD. */
export const W = 1080;
export const H = 1920;
export const VIDEO = /\.(mp4|mkv|mov|webm|avi|m4v|mts)$/i;
export const IMAGE = /\.(png|jpe?g|webp|gif)$/i;

/** An emphasis is a hard cut in and out; most this many on a short. */
export const MAX_EMPHASIS = 2;
/** Where the face's framing.y lands, down the frame: high, clear of the captions (from 1210 px down). */
const FACE_AT = 0.3;
export const DEFAULT_ZOOM = 1.15;
/** A `fit` insert (a screen recording, whole) sits with its middle this far down the frame, over a backdrop of itself. */
const FIT_CENTER = 0.42;
/** The backdrop: the insert filling the frame, a little closer (so the blur's edge is outside), blurred and dimmed. */
const BACKDROP = { zoom: 1.12, sigma: 40, brightness: 0.55 };
/** Past this many output pixels per footage pixel, the picture goes soft. */
const SOFT_SCALE = 1.5;

export function paths(name: string) {
  const dir = path.resolve("projects", name);
  const a = (f: string) => path.join(dir, "analysis", f);
  return {
    name,
    dir,
    settings: path.join(dir, "project.yaml"),
    footage: path.join(dir, "footage"),
    analysis: path.join(dir, "analysis"),
    summary: a("summary.json"),
    voice: a("voice.wav"),
    transcript: a("transcript.json"),
    transcriptText: a("transcript.txt"),
    cuts: a("cuts.json"),
    silences: a("silences.json"),
    sheets: a("sheets"),
    frames: a("frames"),
    findings: a("findings.md"),
    plan: path.join(dir, "plan.yaml"),
    kdenlive: path.join(dir, `${name}.kdenlive`),
    /** The captions of projects made before they were on Kdenlive's Subtitles track. */
    captions: path.join(dir, "captions.txt"),
    /** Kdenlive's subtitles: the captions, edited in Kdenlive. */
    subtitles: path.join(dir, `${name}.kdenlive.ass`),
    /** Kdenlive's proxies of the footage: small copies it edits with (the render uses the originals). */
    proxy: path.join(dir, "proxy"),
    review: path.join(dir, "review"),
    tmp: path.join(dir, "tmp"),
    out: path.join(dir, "out.mp4"),
    sample: path.join(dir, "sample.mp4"),
  };
}
export type Paths = ReturnType<typeof paths>;

export type Settings = {
  language?: string;
  music?: string;
  musicVolume?: number;
  /** The warm, faded retro look: 0 off, 1 full. Default 1. */
  grade?: number;
  replace?: Record<string, string>;
};

export type Source = Probe & { file: string };
export type Summary = {
  /** The project's frame rate: the camera's, halved when it's over 30. */
  fps: number;
  main: Source;
  /** Cut-in clips by their name in plans: "broll/trail.mp4", "screen/app.mp4". */
  inserts: Record<string, Source & { kind: "broll" | "screen" }>;
  inputs: Record<string, string>;
};

/** Seconds, as 83.4 or "1:23.4". */
export type Time = number | string;
/** Where the camera's 9:16 crop looks (camera pixels), and how close (1: the full height). */
export type Framing = { x?: number; y?: number; zoom?: number };
export type Emphasis = { at: Time; until: Time; zoom?: number; why?: string };
export type Insert = {
  file: string;
  /** Seconds of the camera recording: while what's said there, the insert is seen. */
  at: Time;
  until: Time;
  /** Seconds into the insert's own file. Default 0. */
  from?: Time;
  /** full: fills the frame (b-roll's default); fit: whole, the frame's width, over a blurred fill of itself (screen's default). */
  look?: "full" | "fit";
  /** full only: what of it to show, its own pixels [x, y, w, h]. */
  box?: [number, number, number, number];
  /** Its own sound, heard under the voice at this gain (1: as recorded). Default: silent. */
  sound?: number;
  why?: string;
};
export type PlanSegment = { from: Time; to: Time; why?: string; framing?: Framing; emphasis?: Emphasis[]; inserts?: Insert[] };
export type Plan = { framing?: Framing; segments: PlanSegment[] };

/** The recordings in footage/: the camera, and every clip in b-roll/ and screen/. */
export function footageOf(p: Paths, probeOf: (f: string) => Probe) {
  const list = (d: string, re: RegExp) => (existsSync(d) ? readdirSync(d).filter((f) => re.test(f)).sort() : []);
  const mains = list(p.footage, VIDEO);
  if (mains.length > 1) throw new Error(`footage/ has ${mains.length} videos (${mains.join(", ")}): the camera is one file; put b-roll in footage/broll/ and screen recordings in footage/screen/`);
  const main = mains[0] ? { ...probeOf(path.join(p.footage, mains[0])), file: path.join(p.footage, mains[0]) } : undefined;
  const inserts: Summary["inserts"] = {};
  for (const kind of ["broll", "screen"] as const) {
    for (const f of list(path.join(p.footage, kind), new RegExp(`${VIDEO.source}|${IMAGE.source}`, "i"))) {
      const file = path.join(p.footage, kind, f);
      inserts[`${kind}/${f}`] = { ...probeOf(file), file, kind };
    }
  }
  return { main, inserts };
}

export const projectFps = (fps: number) => {
  const f = Math.round(fps);
  return f > 30 ? Math.round(f / 2) : f;
};

export const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;
export const readYaml = async <T>(file: string): Promise<T> => YAML.parse(await readFile(file, "utf8")) as T;

export function seconds(t: Time): number {
  if (typeof t === "number") return t;
  const m = String(t).trim().match(/^(-?)(?:(\d+):)?(\d+(?:[.,]\d+)?)$/);
  if (!m) throw new Error(`Not a time: "${t}" (use 83.4 or "1:23.4")`);
  return (m[1] ? -1 : 1) * (Number(m[2] ?? 0) * 60 + Number(m[3].replace(",", ".")));
}
export const msOf = (t: Time) => Math.round(seconds(t) * 1000);

export const clock = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};

// --- framing -----------------------------------------------------------------------------

type Size = { width: number; height: number };

/**
 * The rect (in the short's pixels) that shows `src` filling the frame, centred on (cx, cy)
 * of it (cy lands `atY` down the frame, 0.5 the middle) and `zoom` times closer than just
 * filling it, kept so no edge shows.
 */
export function coverRect(src: Size, cx: number, cy: number, zoom: number, atY = 0.5): Rect {
  const k = Math.max(W / src.width, H / src.height) * Math.max(1, zoom);
  const w = src.width * k;
  const h = src.height * k;
  const x = Math.min(0, Math.max(W - w, W / 2 - cx * k));
  const y = Math.min(0, Math.max(H - h, H * atY - cy * k));
  return [x, y, w, h, 1];
}

/** The camera's rect for a framing, zoomed `extra` times more. `framing.y` (a little below the eyes) lands at FACE_AT. */
export function cameraRect(src: Size, framing: Framing, extra = 1): Rect {
  return coverRect(src, framing.x ?? src.width / 2, framing.y ?? src.height / 2, (framing.zoom ?? 1) * extra, framing.y === undefined ? 0.5 : FACE_AT);
}

/** An insert's rect: filling the frame (around its box), or whole across the frame's width. */
export function insertRect(src: Size, ins: Pick<Insert, "look" | "box">, kind: "broll" | "screen"): Rect {
  if ((ins.look ?? (kind === "screen" ? "fit" : "full")) === "fit") {
    const k = W / src.width;
    return [0, H * FIT_CENTER - (src.height * k) / 2, W, src.height * k, 1];
  }
  const b = ins.box ?? [0, 0, src.width, src.height];
  const cover = Math.max(W / src.width, H / src.height);
  // As close as shows all of the box, never so far that an edge shows.
  const zoom = Math.max(1, Math.min(W / b[2], H / b[3]) / cover);
  return coverRect(src, b[0] + b[2] / 2, b[1] + b[3] / 2, zoom);
}

/** Output pixels per footage pixel, for a rect of `src`. */
export const scaleOf = (r: Rect, src: Size) => Math.min(r[2] / src.width, r[3] / src.height);

/**
 * The camera's keyframes for one segment, in frames from its start: its framing, and each
 * emphasis a hard cut to closer, held, and a hard cut back (or held to the cut).
 */
export function cameraKeys(seg: PlanSegment, plan: Plan, src: Size, fps: number, lengthF: number): Key[] {
  const framing = { ...plan.framing, ...seg.framing };
  const base = cameraRect(src, framing);
  const fr = (ms: number) => Math.round((ms / 1000) * fps);
  const from = msOf(seg.from);
  const keys: Key[] = [{ f: 0, type: "|", rect: base }];
  for (const z of [...(seg.emphasis ?? [])].sort((a, b) => msOf(a.at) - msOf(b.at))) {
    const zoomed = cameraRect(src, framing, z.zoom ?? DEFAULT_ZOOM);
    const a = Math.max(keys.at(-1)!.f + 1, fr(msOf(z.at) - from));
    const b = Math.min(lengthF - 1, fr(msOf(z.until) - from));
    if (a >= lengthF - 1 || b <= a) continue;
    keys.push({ f: a, type: "|", rect: zoomed });
    // Back out, unless the cut comes first: a cut is a reset of its own.
    if (b < lengthF - 1) keys.push({ f: b, type: "|", rect: base });
  }
  return keys;
}

// --- checks ------------------------------------------------------------------------------

export type Problem = { level: "error" | "warning"; where: string; what: string };

/** At a cut, the voice this loud or more is heard being cut (speech is about -20 dBFS, quiet under -45). */
export const LOUD_AT_CUT_DB = -38;

/** What's wrong with a plan, before it's made into the Kdenlive project. */
export function checkPlan(plan: Plan, summary: Summary, words: Word[], level?: (ms: number) => number): Problem[] {
  const out: Problem[] = [];
  const err = (where: string, what: string) => out.push({ level: "error", where, what });
  const warn = (where: string, what: string) => out.push({ level: "warning", where, what });
  if (!plan?.segments?.length) {
    err("plan", "no segments");
    return out;
  }
  const main = summary.main;
  let emphases = 0;
  const checkFraming = (where: string, f: Framing | undefined) => {
    if (!f) return;
    if (f.x !== undefined && (f.x < 0 || f.x > main.width)) err(where, `framing x ${f.x} is off the camera (0–${main.width})`);
    if (f.y !== undefined && (f.y < 0 || f.y > main.height)) err(where, `framing y ${f.y} is off the camera (0–${main.height})`);
    if (f.zoom !== undefined && (f.zoom < 1 || f.zoom > 3)) err(where, `framing zoom ${f.zoom}: 1 (fills the frame) to 3`);
  };
  checkFraming("framing", plan.framing);
  const kept: [number, number][] = [];
  let lengthMs = 0;
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
    if (from < 0 || to > main.durationMs + 50) err(where, `outside the recording (0:00.0–${clock(main.durationMs)})`);
    if (to - from < 400) warn(where, `only ${to - from} ms long`);
    checkFraming(where, s.framing);
    for (const [edge, label] of [[from, "starts"], [to, "ends"]] as const) {
      const w = words.find((w) => w.startMs + 40 < edge && w.endMs - 40 > edge);
      if (level) {
        const db = level(edge);
        if (db > LOUD_AT_CUT_DB) warn(where, `${label} where the voice is loud (${Math.round(db)} dB at ${(edge / 1000).toFixed(2)})${w ? `, in "${w.text}"` : ""}: move it to quiet (npm run short -- level)`);
      } else if (w) warn(where, `${label} in the middle of "${w.text}"`);
    }
    for (const [a, b] of kept) if (from < b - 100 && to > a + 100) warn(where, `repeats ${clock(Math.max(a, from))}–${clock(Math.min(b, to))}, also in an earlier segment`);
    kept.push([from, to]);
    lengthMs += to - from;

    const framing = { ...plan.framing, ...s.framing };
    let lastEnd = -Infinity;
    for (const [k, z] of (s.emphasis ?? []).entries()) {
      const zw = `${where}, emphasis ${k + 1}`;
      let at: number, until: number;
      try {
        at = msOf(z.at);
        until = msOf(z.until);
      } catch (e) {
        err(zw, (e as Error).message);
        continue;
      }
      if (at < from || until > to + 50 || until <= at) err(zw, `must be inside its segment (${clock(from)}–${clock(to)}), and end after it starts`);
      if (until - at < 800) warn(zw, `${until - at} ms: a flash`);
      if (at < lastEnd) err(zw, "starts before the one before it ends");
      emphases++;
      lastEnd = until;
      const s1 = z.zoom ?? DEFAULT_ZOOM;
      if (s1 < 1.03 || s1 > 1.6) warn(zw, `zoom ${s1}: an emphasis is slight, about 1.1–1.25`);
      const sharp = scaleOf(cameraRect(main, framing, s1), main);
      if (sharp > SOFT_SCALE) warn(zw, `${sharp.toFixed(2)} output pixels per camera pixel: soft`);
    }

    for (const [k, ins] of (s.inserts ?? []).entries()) {
      const iw = `${where}, insert ${k + 1}`;
      const src = summary.inserts[ins.file];
      if (!src) {
        err(iw, `no ${ins.file} in footage/ (there are: ${Object.keys(summary.inserts).join(", ") || "none"})`);
        continue;
      }
      let at: number, until: number, inFrom: number;
      try {
        at = msOf(ins.at);
        until = msOf(ins.until);
        inFrom = msOf(ins.from ?? 0);
      } catch (e) {
        err(iw, (e as Error).message);
        continue;
      }
      if (at < from - 50 || until > to + 50 || until <= at) err(iw, `must be inside its segment (${clock(from)}–${clock(to)}), and end after it starts`);
      if (until - at < 700) warn(iw, `${until - at} ms: a flash`);
      const image = IMAGE.test(ins.file);
      if (!image && (inFrom < 0 || inFrom + (until - at) > src.durationMs + 50)) err(iw, `${ins.file} is ${clock(src.durationMs)} long: from ${clock(inFrom)} for ${clock(until - at)} runs past it`);
      if (ins.look && ins.look !== "full" && ins.look !== "fit") err(iw, `look "${ins.look}": full or fit`);
      if (ins.sound !== undefined) {
        if (typeof ins.sound !== "number" || ins.sound <= 0 || ins.sound > 4) err(iw, "sound is a gain, over 0 and up to 4 (1: as recorded)");
        else if (image || !src.hasAudio) err(iw, `${ins.file} has no sound`);
      }
      if (ins.box) {
        const b = ins.box;
        if (!Array.isArray(b) || b.length !== 4 || b.some((v) => typeof v !== "number")) err(iw, "box must be [x, y, width, height] in the insert's pixels");
        else if (b[0] < 0 || b[1] < 0 || b[0] + b[2] > src.width + 2 || b[1] + b[3] > src.height + 2) err(iw, `box goes off ${ins.file} (${src.width}×${src.height})`);
        if ((ins.look ?? (src.kind === "screen" ? "fit" : "full")) === "fit") warn(iw, "a box is for look: full; fit shows all of it");
      }
      const sharp = scaleOf(insertRect(src, ins, src.kind), src);
      const filled = scaleOf(insertRect(src, { look: "full" }, "broll"), src);
      if (sharp > SOFT_SCALE && (ins.look ?? (src.kind === "screen" ? "fit" : "full")) === "full" && filled > SOFT_SCALE)
        warn(iw, `filling the vertical frame from ${src.width}×${src.height} enlarges it ${filled.toFixed(2)}× at least: soft whatever the box (look: fit, or 4K footage)`);
      else if (sharp > SOFT_SCALE) warn(iw, `${sharp.toFixed(2)} output pixels per pixel of it: soft (a bigger box)`);
    }
    const ins = [...(s.inserts ?? [])].sort((a, b) => msOf(a.at) - msOf(b.at));
    for (let k = 1; k < ins.length; k++) if (msOf(ins[k].at) < msOf(ins[k - 1].until)) err(where, `inserts overlap at ${clock(msOf(ins[k].at))}`);
  });
  if (emphases > MAX_EMPHASIS) err("plan", `${emphases} emphasis zooms: ${MAX_EMPHASIS} at most on a short, on its strongest lines`);
  if (lengthMs > 60_000) warn("plan", `the cut is ${clock(lengthMs)}: Shorts are 60 s at most, or 3 min with the newer limit`);
  return out;
}

// --- plan → Kdenlive ---------------------------------------------------------------------

/** Kdenlive's fade in and fade out on a piece of the voice, a couple of frames each. */
function voiceFades(inF: number, outF: number): Filter[] {
  const fade = (id: string, a: number, b: number) =>
    ({ mlt_service: "volume", kdenlive_id: id, window: "75", max_gain: "20dB", gain: id === "fadein" ? "0" : "1", end: id === "fadein" ? "1" : "0", in: String(a), out: String(b) }) as Filter;
  return [fade("fadein", inF, inF + 2), fade("fadeout", outF - 2, outF)];
}

/** Kdenlive's Transform effect, animated, on a clip from frame `inF` to `outF` of its file. */
function transform(inF: number, outF: number, keys: Key[], writeRect: (k: Key[]) => string): Filter {
  return {
    mlt_service: "qtblend", kdenlive_id: "qtblend", in: String(inF), out: String(outF),
    rect: writeRect(keys), rotation: keys.map((k) => `${k.f}${k.type}=0`).join(";"),
    compositing: "0", distort: "0", rotate_center: "1", "kdenlive:collapsed": "0",
  } as Filter;
}

/**
 * The plan as a Kdenlive project: the camera's pieces in order, each with its framing and
 * emphasis zooms as Transform keyframes, the clean voice under them (grouped with them), and
 * the inserts on a track above. A guide at each piece says why it's there.
 */
export function buildCut(o: { plan: Plan; summary: Summary; voice: string; root: string; writeRect: (k: Key[]) => string; framesOf: (file: string) => number }): Project {
  const { plan, summary } = o;
  const fps = summary.fps;
  const fr = (ms: number) => Math.round((ms / 1000) * fps);
  const cut = Project.empty({
    width: W, height: H, fps, root: o.root,
    tracks: [
      { name: "Voice", audio: true }, { name: "Insert sound", audio: true },
      { name: "Camera", audio: false }, { name: "Backdrop", audio: false }, { name: "B-roll / screen", audio: false },
    ],
  });
  // Group rows are track numbers in this order.
  const [voiceTrack, soundTrack, cameraTrack, backdropTrack, insertTrack] = cut.tracks;
  const camera = cut.addClip(path.basename(summary.main.file), summary.main.file, o.framesOf(summary.main.file));
  const voice = cut.addClip("Voice (cleaned)", o.voice, o.framesOf(o.voice));
  const insertClips = new Map<string, string>();
  const cameraEntries = [];
  const voiceEntries = [];
  const insertEntries = [];
  const backdropEntries = [];
  const soundEntries = [];
  const groups: [number, number][][] = [];
  const guides: { pos: number; comment: string }[] = [];
  let at = 0;
  for (const [i, s] of plan.segments.entries()) {
    const fromMs = msOf(s.from);
    const inF = fr(fromMs);
    const outF = fr(msOf(s.to)) - 1;
    if (outF < inF) continue;
    const length = outF - inF + 1;
    cameraEntries.push({ at, producer: camera, inF, outF, filters: [transform(inF, outF, cameraKeys(s, plan, summary.main, fps, length), o.writeRect)] });
    voiceEntries.push({ at, producer: voice, inF, outF, filters: voiceFades(inF, outF) });
    groups.push([[2, at], [0, at]]);
    guides.push({ pos: at, comment: `${i + 1}${s.why ? `: ${s.why}` : ""}` });
    for (const ins of s.inserts ?? []) {
      const src = summary.inserts[ins.file];
      if (!insertClips.has(ins.file)) {
        const frames = IMAGE.test(ins.file) ? fr(60_000) : o.framesOf(src.file);
        insertClips.set(ins.file, cut.addClip(ins.file, src.file, frames, { image: IMAGE.test(ins.file) }));
      }
      const atF = at + fr(msOf(ins.at) - fromMs);
      const len = Math.min(at + length, at + fr(msOf(ins.until) - fromMs)) - atF;
      const a = fr(msOf(ins.from ?? 0));
      if (len <= 0) continue;
      const producer = insertClips.get(ins.file)!;
      insertEntries.push({ at: atF, producer, inF: a, outF: a + len - 1, filters: [transform(a, a + len - 1, [{ f: 0, type: "", rect: insertRect(src, ins, src.kind) }], o.writeRect)] });
      const group: [number, number][] = [[4, atF]];
      if (ins.sound) {
        const db = Math.round(20 * Math.log10(ins.sound) * 10) / 10;
        const gain = db ? [{ mlt_service: "volume", kdenlive_id: "volume", level: String(db), in: String(a), out: String(a + len - 1) } as Filter] : [];
        soundEntries.push({ at: atF, producer, inF: a, outF: a + len - 1, filters: [...voiceFades(a, a + len - 1), ...gain] });
        group.push([1, atF]);
      }
      if ((ins.look ?? (src.kind === "screen" ? "fit" : "full")) === "fit") {
        const fill = coverRect(src, src.width / 2, src.height / 2, BACKDROP.zoom);
        // Transform first: after it, the blur works on the frame (MLT skips it the other way round).
        backdropEntries.push({ at: atF, producer, inF: a, outF: a + len - 1, filters: [
          transform(a, a + len - 1, [{ f: 0, type: "", rect: fill }], o.writeRect),
          { mlt_service: "avfilter.gblur", kdenlive_id: "avfilter.gblur", "av.sigma": String(BACKDROP.sigma), "av.sigmaV": String(BACKDROP.sigma), "av.steps": "1", "av.planes": "7" } as Filter,
          { mlt_service: "brightness", kdenlive_id: "brightness", level: String(BACKDROP.brightness) } as Filter,
        ] });
        group.push([3, atF]);
      }
      if (group.length > 1) groups.push(group);
    }
    at += length;
  }
  cut.place(cameraTrack, cameraEntries);
  cut.place(voiceTrack, voiceEntries);
  cut.place(insertTrack, insertEntries.sort((a, b) => a.at - b.at));
  cut.place(backdropTrack, backdropEntries.sort((a, b) => a.at - b.at));
  cut.place(soundTrack, soundEntries.sort((a, b) => a.at - b.at));
  cut.setGroups(groups);
  cut.setGuides(guides);
  cut.setLength(cut.length);
  return cut;
}

// --- Kdenlive → the cut ------------------------------------------------------------------

export type CutClip = {
  resource: string; atF: number; durF: number; fromF: number; speed: number; keys?: Key[]; filters: XmlNode[]; service: string;
  /** Kdenlive's Gaussian blur (sigma, px) and Brightness (1 as it is), the other effects drawn. */
  blur?: number; brightness?: number;
};
export type Cut = {
  fps: number;
  width: number;
  height: number;
  lengthF: number;
  /** Video tracks bottom to top (hidden ones left out), each with its own Transform if it has one. */
  video: { clips: CutClip[]; keys?: Key[] }[];
  audio: CutClip[];
  warnings: string[];
  /** Frames of a time as Kdenlive writes it: a frame number or a timecode. */
  frames: (v?: string) => number;
};

const active = (f: XmlNode) => prop(f, "disable") !== "1";
const transformOf = (filters: XmlNode[]) => filters.find((f) => active(f) && prop(f, "mlt_service") === "qtblend" && prop(f, "rect"));

/** The cut as it is in Kdenlive now: every clip of every track, with its Transform. */
export async function readCut(file: string): Promise<Cut> {
  const pj = new Project(await readFile(file, "utf8"));
  const warnings: string[] = [];
  const size = { w: pj.width, h: pj.height };
  const clipsOf = (t: (typeof pj.tracks)[number]) =>
    t.clips.map((c): CutClip => {
      const durF = c.outF - c.inF + 1;
      const tf = transformOf(c.filters ?? []);
      let keys: Key[] | undefined;
      if (tf) {
        // The filter's keyframes count from its own start, which Kdenlive keeps at the clip's.
        const shift = pj.frames(tf.attrs.in ?? String(c.inF)) - c.inF;
        // Outside its range Kdenlive draws the clip without it (whole, fitted): a clip made longer keeps its old Transform.
        if (pj.frames(tf.attrs.in ?? String(c.inF)) > c.inF || pj.frames(tf.attrs.out ?? String(c.outF)) < c.outF)
          warnings.push(`the Transform of the clip at ${(c.at / pj.fps).toFixed(2)} s doesn't cover all of it: Kdenlive shows the rest unframed, the render framed (stretch the effect to the clip)`);
        keys = parseRect(prop(tf, "rect")!, { fps: pj.fps, length: durF, size }).map((k) => ({ ...k, f: k.f + shift }));
      }
      const first = (f: XmlNode | undefined, name: string) => (f ? parseFloat((prop(f, name) ?? "").split(";")[0].split("=").at(-1)!) : NaN);
      const by = (svc: string) => (c.filters ?? []).find((f) => active(f) && prop(f, "mlt_service") === svc);
      const blur = first(by("avfilter.gblur"), "av.sigma");
      const brightness = first(by("brightness"), "level");
      return {
        resource: c.resource, atF: c.at, durF, fromF: Math.round(c.inF * c.speed), speed: c.speed, keys, filters: c.filters ?? [], service: c.service ?? "",
        ...(Number.isFinite(blur) ? { blur } : {}), ...(Number.isFinite(brightness) ? { brightness } : {}),
      };
    });
  const video: Cut["video"] = [];
  const audio: CutClip[] = [];
  for (const t of pj.tracks) {
    if (t.hidden) continue;
    if (t.audio) {
      audio.push(...clipsOf(t));
      continue;
    }
    const tf = transformOf(t.filters ?? []);
    video.push({ clips: clipsOf(t), keys: tf ? parseRect(prop(tf, "rect")!, { fps: pj.fps, length: pj.length, size }) : undefined });
  }
  for (const t of video) {
    for (const c of t.clips) {
      if (/kdenlivetitle|color|qtext|frei0r/.test(c.service) && c.resource) warnings.push(`a ${c.service} clip at frame ${c.atF} isn't drawn: only footage and images are`);
      const other = c.filters.filter((f) => active(f) && !["qtblend", "volume", "avfilter.gblur", "brightness"].includes(prop(f, "mlt_service") ?? "")).map((f) => prop(f, "kdenlive_id") ?? prop(f, "mlt_service"));
      if (other.length) warnings.push(`effects ${other.join(", ")} on the clip at frame ${c.atF} aren't rendered (only Transform is)`);
    }
  }
  return { fps: pj.fps, width: pj.width, height: pj.height, lengthF: pj.length, video, audio, warnings, frames: (v?: string) => pj.frames(v) };
}

// --- transcript --------------------------------------------------------------------------

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

/**
 * "outer view" → "Outerview": a phrase of one or more words, matched case-insensitively. Its
 * last word may go on with a hyphen: "kampi-apinan" style forms keep their ending.
 */
export function applyReplacements(words: Word[], replace: Record<string, string>): Word[] {
  const bare = (t: string) => t.toLowerCase().replace(/[.,!?;:"]+$/u, "");
  const rules = Object.entries(replace).map(([from, to]) => ({ from: from.toLowerCase().split(/\s+/), to }));
  const matches = (r: (typeof rules)[number], i: number) =>
    r.from.every((part, k) => {
      const w = words[i + k] && bare(words[i + k].text);
      return w === part || (k === r.from.length - 1 && w?.startsWith(`${part}-`));
    });
  const out: Word[] = [];
  for (let i = 0; i < words.length; i++) {
    const rule = rules.find((r) => matches(r, i));
    if (!rule) {
      out.push(words[i]);
      continue;
    }
    const last = words[i + rule.from.length - 1];
    const trailing = last.text.slice(rule.from.at(-1)!.length);
    out.push({ text: rule.to + trailing, startMs: words[i].startMs, endMs: last.endMs });
    i += rule.from.length - 1;
  }
  return out;
}
