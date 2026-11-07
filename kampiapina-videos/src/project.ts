// A video, as the agents, the scripts and Resolve share it: everything is a file in
// projects/<name>/, so any step can be read, changed by hand, or done again on its own.
//
//   project.yaml        where the footage is, its roles, the Resolve project, music, titles
//   analysis/           what the analyzer found: voice, transcript, silences, a first guess, contact sheets
//   plan.yaml           the first cut, as the planner decided it
//   tmp/                build.json and the timeline template the builder gives Resolve
// The footage itself stays where it was dropped (project.yaml's `source`): Resolve links to it there.
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { durationOf, type Camera, type Probe } from "./lib/media.ts";
import type { Word } from "./types.ts";

/** The video: full HD, at the A-roll's frame rate. */
export const W = 1920;
export const H = 1080;
export const VIDEO = /\.(mp4|mkv|mov|webm|avi|m4v|mts)$/i;
export const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
export const MUSIC = /\.(mp3|wav|m4a|aac|flac|aif|aiff)$/i;
/** A camera's colour group in the Resolve project (made from the Kampiapina template). */
export const GROUPS: Record<Camera, string> = { Lumix: "Lumix", DJI: "DJI", GoPro: "GoPro" };
/** The brand titles in the template's Brand/Titles bin: the main title (a timeline), the overlays and the end title (Fusion compositions). */
export const TITLES = { main: "Main title 2026 (merged)", social: "Social links", musicBy: "Music by Kampiapina", end: "End title" };
/**
 * The main title, as it's always cut: the talk stops after the intro says what the video is
 * about, the title's picture plays (its drawn part, seconds of the title's own timeline;
 * the plain colour it ends on is left out), and the talk goes on from the same frame. Its
 * jingle is the whole title, starting before the picture, under the intro. The music
 * starts a little before the picture too.
 */
export const MAIN_TITLE = { pictureFrom: 4.75, pictureTo: 9.5, jingleDb: -10.5, musicLead: 2.6 };
/** The overlays follow the main title: Social links this long after its picture ends, Music by Kampiapina this long after Social links ends. */
export const TITLE_AFTER = { social: 16, musicBy: 5 };
/** The end title starts over the sign-off and runs past the last word: this long before the talk's end when the plan doesn't say where. */
export const END_OVERLAP = 8;
export const MUSIC_DB = -18;
export const PUNCH = 1.18;
/** A punch-in past this is soft from 4K on full HD. */
const MAX_ZOOM = 1.6;

export function paths(name: string) {
  const dir = path.resolve("projects", name);
  const a = (f: string) => path.join(dir, "analysis", f);
  return {
    name,
    dir,
    settings: path.join(dir, "project.yaml"),
    analysis: path.join(dir, "analysis"),
    summary: a("summary.json"),
    sheets: a("sheets"),
    frames: a("frames"),
    findings: a("findings.md"),
    /** Per A-roll file (by its stem): the mastered voice, its transcript, silences and the first guess. */
    voice: (stem: string) => a(`${stem}.voice.wav`),
    transcript: (stem: string) => a(`${stem}.transcript.json`),
    transcriptText: (stem: string) => a(`${stem}.transcript.txt`),
    silences: (stem: string) => a(`${stem}.silences.json`),
    cuts: (stem: string) => a(`${stem}.cuts.json`),
    plan: path.join(dir, "plan.yaml"),
    tmp: path.join(dir, "tmp"),
    build: path.join(dir, "tmp", "build.json"),
    fcpxml: path.join(dir, "tmp", "timeline.fcpxml"),
  };
}
export type Paths = ReturnType<typeof paths>;

export type Role = "aroll" | "broll" | "skip";
/** Seconds, as 83.4 or "1:23.4". */
export type Time = number | string;

export type Settings = {
  /** The folder the footage was dropped in: its videos, or a footage/ folder in it, and the music. */
  source: string;
  resolve?: { project?: string; timeline?: string };
  language?: string;
  /** A track under the voice: a file in `source`, or any path. */
  music?: string;
  /** Its level, dB (default -18). */
  musicDb?: number;
  /** The brand titles: another composition's name than the template's, or false to leave one out. Where they go is the plan's and the rules'. */
  titles?: Partial<Record<keyof typeof TITLES, string | false>>;
  /** What each dropped file is, by name. */
  roles?: Record<string, Role>;
};

export type Source = Probe & { file: string; key: string; role: "aroll" | "broll"; group?: string };
export type Summary = {
  /** The timeline's frame rate: the A-roll's. */
  fps: number;
  width: number;
  height: number;
  aroll: Record<string, Source>;
  broll: Record<string, Source>;
  inputs: Record<string, string>;
};

export type Insert = {
  /** The b-roll's file name, as in summary.json. */
  file: string;
  /** Seconds of the A-roll file: while what's said there, the insert is seen. */
  at: Time;
  until: Time;
  /** Seconds into the insert's own file. Default 0. */
  from?: Time;
  why?: string;
};
export type PlanSegment = {
  /** The A-roll file, when there's more than one. */
  file?: string;
  from: Time;
  to: Time;
  why?: string;
  /** A punch-in: 1 as shot, 1.18 closer. Hides a jump cut at the join before it. */
  zoom?: number;
  inserts?: Insert[];
};
export type Plan = {
  segments: PlanSegment[];
  /**
   * Where the titles go, seconds of the A-roll (of the segment the time falls in): `main` the
   * pause after the intro has said what the video is about (the talk stops there for the
   * title); `end` where the sign-off starts (the end title plays over it).
   */
  titles?: { main?: Time; end?: Time };
};

/** The footage: every video in `source` (and `source`/footage/), with its role from project.yaml. */
export function footageFiles(settings: Settings): { file: string; key: string; role?: Role }[] {
  const dirs = [settings.source, path.join(settings.source, "footage")].filter((d) => existsSync(d));
  const out: { file: string; key: string; role?: Role }[] = [];
  for (const d of dirs) {
    for (const f of readdirSync(d).filter((f) => VIDEO.test(f)).sort()) {
      const file = path.join(d, f);
      out.push({ file, key: f, role: settings.roles?.[f] });
    }
  }
  return out;
}

export function musicFile(settings: Settings): string | undefined {
  if (!settings.music) return undefined;
  const candidates = [settings.music, path.join(settings.source, settings.music)];
  return candidates.find((f) => existsSync(f)) ?? settings.music;
}

export const stemOf = (key: string) => key.replace(/\.[^.]+$/, "");
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

/** The A-roll a segment is of: its only one, or the one named. */
export function arollOf(seg: PlanSegment, summary: Summary): Source | undefined {
  const keys = Object.keys(summary.aroll);
  if (seg.file) return summary.aroll[seg.file];
  return keys.length === 1 ? summary.aroll[keys[0]] : undefined;
}

/** The segment a moment of the A-roll falls in (the first one that holds it), or nothing. */
export function segmentAt(plan: Plan, summary: Summary, t: Time): { i: number; seg: PlanSegment; main: Source; ms: number } | undefined {
  const ms = msOf(t);
  for (const [i, seg] of plan.segments.entries()) {
    const main = arollOf(seg, summary);
    if (!main) continue;
    try {
      if (msOf(seg.from) - 50 <= ms && ms <= msOf(seg.to) + 50) return { i, seg, main, ms };
    } catch {}
  }
  return undefined;
}

// --- checks ------------------------------------------------------------------------------

export type Problem = { level: "error" | "warning"; where: string; what: string };

/** At a cut, the voice this loud or more is heard being cut (speech is about -20 dBFS, quiet under -45). */
export const LOUD_AT_CUT_DB = -38;

/** What's wrong with a plan, before it's built in Resolve. */
export function checkPlan(plan: Plan, summary: Summary, words: Record<string, Word[]>, level?: Record<string, (ms: number) => number>): Problem[] {
  const out: Problem[] = [];
  const err = (where: string, what: string) => out.push({ level: "error", where, what });
  const warn = (where: string, what: string) => out.push({ level: "warning", where, what });
  if (!plan?.segments?.length) {
    err("plan", "no segments");
    return out;
  }
  const kept: { key: string; from: number; to: number }[] = [];
  let lengthMs = 0;
  let prev: { key: string; to: number; zoom: number; coveredEnd: boolean } | undefined;
  plan.segments.forEach((s, i) => {
    const where = `segment ${i + 1}`;
    const main = arollOf(s, summary);
    if (!main) {
      err(where, s.file ? `no A-roll ${s.file} (there are: ${Object.keys(summary.aroll).join(", ")})` : `which A-roll? give file: one of ${Object.keys(summary.aroll).join(", ")}`);
      return;
    }
    let from: number, to: number;
    try {
      from = msOf(s.from);
      to = msOf(s.to);
    } catch (e) {
      err(where, (e as Error).message);
      return;
    }
    if (to <= from) err(where, `ends (${clock(to)}) before it starts (${clock(from)})`);
    if (from < 0 || to > main.durationMs + 50) err(where, `outside ${main.key} (0:00.0–${clock(main.durationMs)})`);
    if (to - from < 400) warn(where, `only ${to - from} ms long`);
    const ws = words[main.key] ?? [];
    const lv = level?.[main.key];
    for (const [edge, label] of [[from, "starts"], [to, "ends"]] as const) {
      const w = ws.find((w) => w.startMs + 40 < edge && w.endMs - 40 > edge);
      if (lv) {
        const db = lv(edge);
        if (db > LOUD_AT_CUT_DB) warn(where, `${label} where the voice is loud (${Math.round(db)} dB at ${(edge / 1000).toFixed(2)})${w ? `, in "${w.text}"` : ""}: move it to quiet (npm run video -- level)`);
      } else if (w) warn(where, `${label} in the middle of "${w.text}"`);
    }
    for (const k of kept) if (k.key === main.key && from < k.to - 100 && to > k.from + 100) warn(where, `repeats ${clock(Math.max(k.from, from))}–${clock(Math.min(k.to, to))}, also in an earlier segment`);
    kept.push({ key: main.key, from, to });
    const zoom = s.zoom ?? 1;
    if (zoom < 1 || zoom > MAX_ZOOM) err(where, `zoom ${zoom}: 1 (as shot) to ${MAX_ZOOM}`);
    else if (zoom !== 1 && (zoom < 1.08 || zoom > 1.3)) warn(where, `zoom ${zoom}: a punch-in reads as a second camera at about 1.15–1.25`);

    const ins = [...(s.inserts ?? [])].sort((a, b) => msOf(a.at) - msOf(b.at));
    let coversStart = false;
    let coversEnd = false;
    for (const [k, x] of ins.entries()) {
      const iw = `${where}, insert ${k + 1}`;
      const src = summary.broll[x.file];
      if (!src) {
        err(iw, `no ${x.file} in the b-roll (there is: ${Object.keys(summary.broll).join(", ") || "none"})`);
        continue;
      }
      let at: number, until: number, inFrom: number;
      try {
        at = msOf(x.at);
        until = msOf(x.until);
        inFrom = msOf(x.from ?? 0);
      } catch (e) {
        err(iw, (e as Error).message);
        continue;
      }
      if (at < from - 50 || until > to + 50 || until <= at) err(iw, `must be inside its segment (${clock(from)}–${clock(to)}), and end after it starts`);
      if (until - at < 1000) warn(iw, `${until - at} ms: a flash`);
      if (until - at > 10_000) warn(iw, `${clock(until - at)} of b-roll: long for one insert over a talk`);
      if (inFrom < 0 || inFrom + (until - at) > src.durationMs + 50) err(iw, `${x.file} is ${clock(src.durationMs)} long: from ${clock(inFrom)} for ${clock(until - at)} runs past it`);
      if (k > 0 && at < msOf(ins[k - 1].until)) err(where, `inserts overlap at ${clock(at)}`);
      if (at <= from + 50) coversStart = true;
      if (until >= to - 50) coversEnd = true;
      const mainAt = plan.titles?.main != null ? segmentAt(plan, summary, plan.titles.main) : undefined;
      if (mainAt && mainAt.i === i && at < mainAt.ms - 50 && until > mainAt.ms + 50) err(iw, `runs across the main title (${clock(mainAt.ms)}): the talk stops there`);
    }
    // A join of two pieces of the same shot jumps unless b-roll covers it or one side is punched in.
    if (prev && prev.key === main.key && !prev.coveredEnd && !coversStart && prev.zoom === zoom)
      warn(where, `jump cut at its start (${clock(lengthMs)} of the cut): punch in (zoom: ${PUNCH}) on this or the piece before, or cover the join with b-roll`);
    prev = { key: main.key, to, zoom, coveredEnd: coversEnd };
    lengthMs += to - from;
  });

  // The titles: the main title in the intro's pause, the end title over the sign-off.
  const t = plan.titles ?? {};
  const cutMs = (hit: NonNullable<ReturnType<typeof segmentAt>>) => plan.segments.slice(0, hit.i).reduce((n, s) => n + msOf(s.to) - msOf(s.from), 0) + hit.ms - msOf(hit.seg.from);
  if (t.main == null) warn("titles", "no main: the main title goes in the pause after the intro has said what the video is about (titles: { main: <A-roll seconds> })");
  else {
    const hit = segmentAt(plan, summary, t.main);
    if (!hit) err("titles.main", `${clock(msOf(t.main))} is in no segment: it must be a moment of the talk that's kept`);
    else {
      const at = cutMs(hit);
      if (at < 3000 || at > 30_000) warn("titles.main", `${clock(at)} into the cut: the title comes after the greeting and one sentence on what the video is about, usually 5–15 s in`);
      const lv = level?.[hit.main.key];
      const w = (words[hit.main.key] ?? []).find((w) => w.startMs + 40 < hit.ms && w.endMs - 40 > hit.ms);
      if (lv && lv(hit.ms) > LOUD_AT_CUT_DB) warn("titles.main", `the voice is loud there (${Math.round(lv(hit.ms))} dB)${w ? `, in "${w.text}"` : ""}: the talk stops for the title, so put it in the quiet after the sentence`);
      else if (!lv && w) warn("titles.main", `in the middle of "${w.text}"`);
    }
  }
  if (t.end == null) warn("titles", `no end: the end title starts where the sign-off starts and plays over it (titles: { end: <A-roll seconds> }); without it, ${END_OVERLAP} s before the last word`);
  else {
    const hit = segmentAt(plan, summary, t.end);
    if (!hit) err("titles.end", `${clock(msOf(t.end))} is in no segment`);
    else {
      const left = lengthMs - cutMs(hit);
      if (hit.i !== plan.segments.length - 1) warn("titles.end", `in segment ${hit.i + 1}, not the last: the end title covers everything after it`);
      if (left > 11_000) warn("titles.end", `${clock(left)} of talk after it: the end title is 12 s, the talk would outlast it`);
      if (left < 3000) warn("titles.end", `only ${clock(left)} of talk after it: the end title starts as the sign-off starts, over it`);
    }
  }
  return out;
}

// --- plan → build.json -------------------------------------------------------------------

export type Build = {
  project: string;
  timeline: string;
  fps: number;
  width: number;
  height: number;
  /** An empty timeline at the right frame rate, for Resolve to import: the API can't set a fractional rate itself. */
  fcpxml: string;
  /** Every file the cut uses, and the colour group its camera's clips go in. */
  media: { key: string; path: string; group?: string }[];
  /** Timeline frames from its start; source frames of the file (`outF` exclusive). */
  aroll: { key: string; inF: number; outF: number; atF: number; zoom: number; why?: string }[];
  broll: { key: string; inF: number; outF: number; atF: number; why?: string }[];
  /**
   * The main title (a timeline in the template's bin): its picture on track 3 at `atF`, in a gap
   * of the talk, `from`–`to` seconds of the title's own timeline; the whole of it as sound
   * on audio track 3 at `jingleAtF` (its `jingleFromS` cut off when it would start before 0).
   */
  main?: { name: string; atF: number; from: number; to: number; jingleAtF: number; jingleFromS: number; jingleDb: number };
  /**
   * The other brand titles, on track 3, in order: at `atF`, or `afterF` frames after the one
   * before ends. The end title overlaps the talk's end and may run past it.
   */
  titles: ({ name: string; track: number; end?: true } & ({ atF: number } | { afterF: number }))[];
  /** The music, from `atF` to the end of everything. */
  music?: { path: string; durationMs: number; db: number; atF: number; fadeInF: number; fadeOutF: number };
  /** The cut's length: the talk, with the main title's gap. The end title may run past it. */
  lengthF: number;
};

export function buildOf(o: { plan: Plan; summary: Summary; settings: Settings; p: Paths }): Build {
  const { plan, summary, settings, p } = o;
  const fps = summary.fps;
  const fr = (ms: number) => Math.round((ms / 1000) * fps);
  const media = new Map<string, Build["media"][number]>();
  const use = (s: Source) => {
    if (!media.has(s.key)) media.set(s.key, { key: s.key, path: s.file, ...(s.group ? { group: s.group } : {}) });
  };
  const on = (k: keyof typeof TITLES) => settings.titles?.[k] !== false;
  const nameOf = (k: keyof typeof TITLES) => {
    const v = settings.titles?.[k];
    return typeof v === "string" ? v : TITLES[k];
  };
  const music = musicFile(settings);
  const hasMusic = !!music && existsSync(music);

  // The talk in pieces: the segments, the one the main title falls in split there, since the talk stops for the title.
  type Piece = { seg: number; main: Source; fromMs: number; toMs: number; zoom: number; inserts: Insert[]; why?: string };
  const mainHit = on("main") && plan.titles?.main != null ? segmentAt(plan, summary, plan.titles.main) : undefined;
  const endHit = on("end") && plan.titles?.end != null ? segmentAt(plan, summary, plan.titles.end) : undefined;
  const pieces: Piece[] = [];
  let titleBefore: number | undefined;
  plan.segments.forEach((s, i) => {
    const main = arollOf(s, summary)!;
    const piece: Piece = { seg: i, main, fromMs: msOf(s.from), toMs: msOf(s.to), zoom: s.zoom ?? 1, inserts: s.inserts ?? [], ...(s.why ? { why: s.why } : {}) };
    if (mainHit?.i !== i) {
      pieces.push(piece);
      return;
    }
    const t = Math.min(Math.max(mainHit.ms, piece.fromMs), piece.toMs);
    if (t - piece.fromMs >= 50) pieces.push({ ...piece, toMs: t, inserts: piece.inserts.filter((x) => msOf(x.at) < t) });
    titleBefore = pieces.length;
    if (piece.toMs - t >= 50) pieces.push({ ...piece, fromMs: t, inserts: piece.inserts.filter((x) => msOf(x.at) >= t) });
  });

  const gapF = fr((MAIN_TITLE.pictureTo - MAIN_TITLE.pictureFrom) * 1000);
  const aroll: Build["aroll"] = [];
  const broll: Build["broll"] = [];
  let at = 0;
  let mainAtF: number | undefined;
  let endAtF: number | undefined;
  for (const [i, s] of pieces.entries()) {
    if (titleBefore === i) {
      mainAtF = at;
      at += gapF;
    }
    use(s.main);
    const inF = Math.round((s.fromMs / 1000) * s.main.fps);
    const outF = Math.round((s.toMs / 1000) * s.main.fps);
    const len = outF - inF;
    if (len <= 0) continue;
    aroll.push({ key: s.main.key, inF, outF, atF: at, zoom: s.zoom, ...(s.why ? { why: s.why } : {}) });
    if (endHit && endHit.i === s.seg && endHit.ms >= s.fromMs - 50 && endHit.ms <= s.toMs + 50) endAtF = at + fr(Math.min(Math.max(endHit.ms, s.fromMs), s.toMs) - s.fromMs);
    for (const x of s.inserts) {
      const src = summary.broll[x.file];
      use(src);
      const atF = at + fr(msOf(x.at) - s.fromMs);
      const endF = Math.min(at + len, at + fr(msOf(x.until) - s.fromMs));
      const a = Math.round((msOf(x.from ?? 0) / 1000) * src.fps);
      const n = endF - atF;
      if (n <= 0) continue;
      // The b-roll's own frames: as many as the timeline shows, at its own rate.
      const srcN = Math.round((n / fps) * src.fps);
      broll.push({ key: x.file, inF: a, outF: a + srcN, atF, ...(x.why ? { why: x.why } : {}) });
    }
    at += len;
  }
  if (titleBefore === pieces.length) {
    mainAtF = at;
    at += gapF;
  }

  // The titles, in their order: main, social, music by; the end title over the sign-off.
  const main: Build["main"] | undefined =
    mainAtF == null
      ? undefined
      : {
          name: nameOf("main"), atF: mainAtF, from: MAIN_TITLE.pictureFrom, to: MAIN_TITLE.pictureTo,
          jingleAtF: Math.max(0, mainAtF - fr(MAIN_TITLE.pictureFrom * 1000)),
          jingleFromS: Math.max(0, MAIN_TITLE.pictureFrom - mainAtF / fps),
          jingleDb: MAIN_TITLE.jingleDb,
        };
  const afterMainF = mainAtF == null ? 0 : mainAtF + gapF;
  const titles: Build["titles"] = [];
  if (on("social")) titles.push({ name: nameOf("social"), track: 3, atF: Math.min(afterMainF + fr(TITLE_AFTER.social * 1000), Math.max(0, at - fr(8000))) });
  if (on("musicBy") && hasMusic) titles.push({ name: nameOf("musicBy"), track: 3, afterF: fr(TITLE_AFTER.musicBy * 1000) });
  if (on("end")) titles.push({ name: nameOf("end"), track: 3, atF: endAtF ?? Math.max(0, at - fr(END_OVERLAP * 1000)), end: true });
  return {
    project: settings.resolve?.project ?? p.name,
    timeline: settings.resolve?.timeline ?? p.name,
    fps, width: W, height: H, fcpxml: p.fcpxml,
    media: [...media.values()],
    aroll, broll: broll.sort((a, b) => a.atF - b.atF),
    ...(main ? { main } : {}),
    titles,
    ...(hasMusic
      ? { music: { path: music, durationMs: durationOf(music), db: settings.musicDb ?? MUSIC_DB, atF: mainAtF == null ? 0 : Math.max(0, mainAtF - fr(MAIN_TITLE.musicLead * 1000)), fadeInF: fr(1000), fadeOutF: fr(3000) } }
      : {}),
    lengthF: at,
  };
}

/** An empty FCPXML sequence at `fps` and `w`×`h`: Resolve makes a timeline of it with that rate. */
export function emptyFcpxml(name: string, fps: number, w: number, h: number): string {
  const [num, den] = Math.abs(fps - Math.round(fps)) < 0.01 ? [1, Math.round(fps)] : [1001, Math.round(fps * 1001)];
  const frame = `${num}/${den}s`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.8">
  <resources>
    <format id="r1" name="FFVideoFormat${h}p${String(fps).replace(".", "")}" frameDuration="${frame}" width="${w}" height="${h}"/>
  </resources>
  <library>
    <event name="${name}">
      <project name="${name}">
        <sequence format="r1" duration="${frame}" tcStart="3600s" tcFormat="NDF">
          <spine>
            <gap name="Gap" offset="3600s" start="3600s" duration="${frame}"/>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
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
