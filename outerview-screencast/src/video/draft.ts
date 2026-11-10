// The draft: the plan as a Kdenlive project, to watch and fix by hand before the slow render.
// Kdenlive shows it plainly: the screen recording whole (no zooms), the face small in its
// corner all the way through, the voice, and the captions on the Subtitles track. The render
// reads it back: the cut from the Sound track, the captions from the Subtitles track; the
// layouts (face / screen) and zooms still come from plan.yaml, by the recording's time.
import path from "node:path";
import type { EditManifest, Word } from "../types.ts";
import { chunk, LINGER_MS } from "../remotion/Captions.tsx";
import { Project, prop, setProp, type Filter } from "../screencast/kdenlive-xml.ts";
import { FPS, homeSegments, seconds, type Plan, type Summary } from "./project.ts";

const W = 1920;
const H = 1080;
/** The face in the draft: this tall, this far in from the bottom right (as the render's corner). */
const PIP_H = 400;
const PIP_MARGIN = 40;

/** Tracks, bottom to top (audio first): their index is what groups name. */
const TRACKS = [
  { name: "Sound", audio: true },
  { name: "Screen", audio: false },
  { name: "Face", audio: false },
];
const [SOUND, SCREEN, FACE] = [0, 1, 2];

const fr = (ms: number) => Math.round((ms / 1000) * FPS);
const msOf = (t: number | string) => Math.round(seconds(t) * 1000);

/**
 * The plan as a Kdenlive project: each piece's sound on the Sound track (the clean voice, or
 * the screen recording's own for `sound: screen`), the screen recording under it, the face
 * over it in its corner, all three grouped. A guide at each piece and each zoom says what it is.
 */
export function buildDraft(o: { plan: Plan; summary: Summary; voice: string; screenSound?: string; root: string }): { project: Project; warnings: string[] } {
  const { plan, summary } = o;
  const warnings: string[] = [];
  const pj = Project.empty({ width: W, height: H, fps: FPS, root: o.root, tracks: TRACKS });
  const [soundTrack, screenTrack, faceTrack] = pj.tracks;
  const clip = (name: string, file: string, ms: number) => pj.addClip(name, file, fr(ms));
  const sc = summary.screen;
  const face = summary.face;
  const voice = clip("Voice (cleaned)", o.voice, summary.durationMs);
  const screenSound = o.screenSound && sc ? clip("Screen sound", o.screenSound, sc.durationMs) : undefined;
  const screen = sc ? clip(`Screen: ${path.basename(sc.file)}`, sc.file, sc.durationMs) : undefined;
  const faceClip = face ? clip(`Face: ${path.basename(face.file)}`, face.file, face.durationMs) : undefined;

  const sound: Parameters<Project["place"]>[1] = [];
  const screens: typeof sound = [];
  const faces: typeof sound = [];
  const groups: [number, number][][] = [];
  const guides: { pos: number; comment: string }[] = [];
  let at = 0;
  for (const [i, s] of plan.segments.entries()) {
    const from = msOf(s.from);
    const inF = fr(from);
    const outF = fr(msOf(s.to)) - 1;
    if (outF < inF) continue;
    const length = outF - inF + 1;
    const group: [number, number][] = [[SOUND, at]];
    if (s.sound === "screen" && screenSound && sc) {
      const a = fr(from - sc.startMs);
      sound.push({ at, producer: screenSound, inF: a, outF: a + length - 1, filters: fades(a, a + length - 1) });
    } else sound.push({ at, producer: voice, inF, outF, filters: fades(inF, outF) });
    // A recording's piece, where it has all of it.
    const piece = (r: Summary["screen"]) => {
      const a = fr(from - r!.startMs);
      return a >= 0 && a + length <= fr(r!.durationMs) ? a : undefined;
    };
    if (screen && sc) {
      const a = piece(sc);
      if (a === undefined) warnings.push(`segment ${i + 1}: the screen recording doesn't cover it, left out of the draft`);
      else {
        screens.push({ at, producer: screen, inF: a, outF: a + length - 1 });
        group.push([SCREEN, at]);
      }
    }
    if (faceClip && face) {
      const a = piece(face);
      if (a === undefined) warnings.push(`segment ${i + 1}: the face recording doesn't cover it, left out of the draft`);
      else {
        // In its corner over the screen; alone (no screen), whole.
        const filters = sc ? [corner(a, a + length - 1, face)] : [];
        faces.push({ at, producer: faceClip, inF: a, outF: a + length - 1, filters });
        group.push([FACE, at]);
      }
    }
    if (group.length > 1) groups.push(group);
    guides.push({ pos: at, comment: `${i + 1} ${s.layout}${s.why ? `: ${s.why}` : ""}` });
    for (const z of s.zooms ?? []) guides.push({ pos: at + fr(msOf(z.at) - from), comment: `zoom${z.why ? `: ${z.why}` : ""}` });
    at += length;
  }
  pj.place(soundTrack, sound);
  pj.place(screenTrack, screens);
  pj.place(faceTrack, faces);
  pj.setGroups(groups);
  pj.setGuides(guides.sort((a, b) => a.pos - b.pos));
  pj.setLength(pj.length);
  return { project: pj, warnings };
}

/** Fade the sound in and out over two frames at each cut, so the joins don't click. */
function fades(inF: number, outF: number): Filter[] {
  const fade = (id: string, a: number, b: number) =>
    ({ mlt_service: "volume", kdenlive_id: id, window: "75", max_gain: "20dB", gain: id === "fadein" ? "0" : "1", end: id === "fadein" ? "1" : "0", in: String(a), out: String(b) }) as Filter;
  return [fade("fadein", inF, inF + 2), fade("fadeout", outF - 2, outF)];
}

/** Kdenlive's Transform: the face fitted in the bottom right corner, where the render puts it. */
function corner(inF: number, outF: number, face: { width: number; height: number }): Filter {
  const w = Math.round((PIP_H * face.width) / face.height);
  const rect = `0=${W - PIP_MARGIN - w} ${H - PIP_MARGIN - PIP_H} ${w} ${PIP_H} 1.000000`;
  return {
    mlt_service: "qtblend", kdenlive_id: "qtblend", in: String(inF), out: String(outF),
    rect, rotation: "0=0", compositing: "0", distort: "0", rotate_center: "1", "kdenlive:collapsed": "0",
  } as Filter;
}

// --- Kdenlive → the cut ------------------------------------------------------------------

/** A piece of the cut as it is in Kdenlive: where (ms of the cut), what (ms of the main recording), whose sound. */
export type DraftPiece = { atMs: number; fromMs: number; durationMs: number; sound?: "screen" };

/**
 * The cut as it is in the draft now: the pieces on its audio tracks of the clean voice and the
 * screen's sound. The picture follows them (the render lays it out by the plan); a screen or
 * face clip moved away from its sound is said, not followed.
 */
export function readDraft(doc: string, o: { voice: string; screenSound: string; summary: Summary }): { pieces: DraftPiece[]; warnings: string[] } {
  const pj = new Project(doc);
  const warnings: string[] = [];
  const ms = (f: number) => Math.round((f / pj.fps) * 1000);
  if (pj.fps !== FPS || pj.width !== W || pj.height !== H) warnings.push(`the draft is ${pj.width}×${pj.height} at ${pj.fps} fps; the video is ${W}×${H} at ${FPS}`);
  const sc = o.summary.screen;
  const face = o.summary.face;
  const pieces: (DraftPiece & { fromF: number; atF: number })[] = [];
  for (const t of pj.tracks.filter((t) => t.audio && !t.hidden)) {
    for (const c of t.clips) {
      const kind = c.resource === o.voice ? "voice" : c.resource === o.screenSound ? "screen" : undefined;
      if (!kind) continue;
      if (c.speed !== 1) {
        warnings.push(`the sound at ${clockOf(ms(c.at))} is sped up: left out (the render plays the voice as said)`);
        continue;
      }
      const shift = kind === "screen" && sc ? sc.startMs : 0;
      pieces.push({ atF: c.at, fromF: c.inF, atMs: ms(c.at), fromMs: ms(c.inF) + shift, durationMs: ms(c.at + c.outF - c.inF + 1) - ms(c.at), ...(kind === "screen" ? { sound: "screen" as const } : {}) });
    }
  }
  pieces.sort((a, b) => a.atMs - b.atMs);
  for (const [i, x] of pieces.entries()) {
    const prev = pieces[i - 1];
    if (prev && x.atMs < prev.atMs + prev.durationMs - 1) warnings.push(`sound overlaps at ${clockOf(x.atMs)}: both play`);
    else if (prev && x.atMs > prev.atMs + prev.durationMs + 40) warnings.push(`a gap of ${((x.atMs - prev.atMs - prev.durationMs) / 1000).toFixed(1)} s in the sound at ${clockOf(prev.atMs + prev.durationMs)}: black there`);
  }
  if (pieces[0]?.atMs > 40) warnings.push(`the sound starts at ${clockOf(pieces[0].atMs)}: black before it`);
  // The picture where the user put it, against its sound.
  for (const [kind, r] of [["Screen", sc], ["Face", face]] as const) {
    if (!r) continue;
    const file = path.resolve(r.file);
    const clips = pj.tracks.filter((t) => !t.audio && !t.hidden).flatMap((t) => t.clips.filter((c) => c.resource === file));
    for (const x of pieces) {
      const want = fr(x.fromMs - r.startMs);
      const ok = clips.some((c) => c.at <= x.atF + 1 && c.at + c.outF - c.inF + 1 >= x.atF + 1 && Math.abs(c.inF + (x.atF - c.at) - want) <= 1);
      if (!ok) warnings.push(`${kind.toLowerCase()} at ${clockOf(x.atMs)} isn't in step with its sound: the render shows it in step (it follows the Sound track)`);
    }
  }
  return { pieces: pieces.map(({ atF: _a, fromF: _f, ...x }) => x), warnings };
}

const clockOf = (ms: number) => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(1).padStart(4, "0")}`;

/**
 * The draft's pieces as the render's segments: each takes its layout from the plan's segment
 * holding most of it (or the nearest), and the plan's zooms that start inside it.
 */
export function segmentsOfDraft(pieces: DraftPiece[], plan: Plan): Pick<EditManifest, "segments" | "zooms" | "cutMs"> {
  const ranges = plan.segments.map((s) => [msOf(s.from), msOf(s.to)] as const);
  const segments: EditManifest["segments"] = [];
  const zooms: EditManifest["zooms"] = [];
  for (const x of pieces) {
    const end = x.fromMs + x.durationMs;
    let best = 0;
    let most = -Infinity;
    ranges.forEach(([a, b], i) => {
      // Overlap, or (negative) how far away.
      const v = Math.min(b, end) - Math.max(a, x.fromMs);
      if (v > most) [best, most] = [i, v];
    });
    const s = plan.segments[best];
    segments.push({ atMs: x.atMs, fromMs: x.fromMs, durationMs: x.durationMs, layout: s?.layout ?? "screen", ...(x.sound ? { sound: x.sound } : {}) });
    if ((s?.layout ?? "screen") !== "screen") continue;
    for (const z of plan.segments.flatMap((p) => p.zooms ?? [])) {
      const za = msOf(z.at);
      if (za < x.fromMs || za >= end - 300) continue;
      zooms.push({ atMs: x.atMs + za - x.fromMs, untilMs: x.atMs + Math.min(msOf(z.until), end) - x.fromMs, box: z.box });
    }
  }
  const last = segments.at(-1);
  return { segments, zooms: zooms.sort((a, b) => a.atMs - b.atMs), cutMs: last ? last.atMs + last.durationMs : 0 };
}

/** The transcript's words where the cut plays them (ms of the cut), each with the piece holding most of it. */
export function wordsOfCut(words: Word[], segments: Pick<EditManifest["segments"][number], "atMs" | "fromMs" | "durationMs">[]): Word[] {
  const home = homeSegments(words, segments.map((s) => [s.fromMs, s.fromMs + s.durationMs] as const));
  return words.flatMap((w, k) => {
    const s = segments[home[k] ?? -1];
    if (!s) return [];
    const at = (t: number) => s.atMs + Math.min(s.durationMs, Math.max(0, t - s.fromMs));
    return [{ text: w.text, startMs: at(w.startMs), endMs: at(w.endMs) }];
  });
}

// --- captions: Kdenlive's Subtitles track ------------------------------------------------

/** A caption as Kdenlive's subtitles hold it: its text, shown from start to end (ms of the cut). */
export type Caption = { startMs: number; endMs: number; text: string };

/** The cut's words as caption lines, as the render cuts them, each up until the next starts. */
export function captionLines(words: Word[]): Caption[] {
  const lines = chunk(words);
  return lines.map((l, i) => ({
    startMs: l[0].startMs,
    endMs: Math.min(l.at(-1)!.endMs + LINGER_MS, lines[i + 1]?.[0].startMs ?? Infinity),
    text: l.map((w) => w.text).join(" "),
  }));
}

const assTime = (ms: number) => {
  const cs = Math.round(ms / 10);
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};

/**
 * Kdenlive's subtitles (<name>.kdenlive.ass), for seeing and fixing the captions there. The
 * render draws them in its own style from their text and times; here they're about where it
 * puts them: white on a dark box, bottom middle.
 */
export function writeAss(captions: Caption[]): string {
  return [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Default,Sans,52,&H00FFFFFF,&H00FFFFFF,&H24111111,&H24111111,-1,0,0,0,100,100,0,0,3,16,0,8,360,360,920,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...captions.map((c) => `Dialogue: 0,${assTime(c.startMs)},${assTime(c.endMs)},Default,,0,0,0,,${c.text}`),
    "",
  ].join("\n");
}

/** The captions in Kdenlive's subtitles file, as they are after editing there. */
export function readAss(txt: string): Caption[] {
  const ms = (c: string) => {
    const [h, m, sec] = c.trim().split(":").map(Number);
    return Math.round(((h * 60 + m) * 60 + sec) * 1000);
  };
  const out: Caption[] = [];
  for (const line of txt.split(/\r?\n/)) {
    if (!line.startsWith("Dialogue:")) continue;
    const f = line.slice("Dialogue:".length).split(",");
    // Kdenlive's styling ({\b1}…) and line breaks (\N) aren't the render's: plain words.
    const text = f.slice(9).join(",").replace(/\{[^}]*\}/g, "").replace(/\\[Nnh]/g, " ").trim();
    if (text) out.push({ startMs: ms(f[1]), endMs: ms(f[2]), text });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/**
 * Captions with their words timed as said (the transcript, where the cut plays it), so the
 * render can pick out the word being said: a line keeps the words' own times while it has as
 * many words as were said in it; otherwise its words are spread over what's said in it.
 */
export function timeCaptions(captions: Caption[], words: Word[]): { startMs: number; endMs: number; words: Word[] }[] {
  return captions.map(({ startMs, endMs, text }) => {
    const tokens = text.split(/\s+/).filter(Boolean);
    const said = words.filter((w) => (w.startMs + w.endMs) / 2 >= startMs - 20 && (w.startMs + w.endMs) / 2 < endMs);
    const timed =
      said.length === tokens.length
        ? tokens.map((t, i) => ({ text: t, startMs: Math.max(said[i].startMs, startMs), endMs: said[i].endMs }))
        : tokens.map((t, i) => {
            const from = Math.max(startMs, said[0]?.startMs ?? startMs);
            const to = Math.min(endMs, said.at(-1)?.endMs ?? Math.max(from + 200, endMs - LINGER_MS));
            const step = Math.max(0, to - from) / tokens.length;
            return { text: t, startMs: Math.round(from + i * step), endMs: Math.round(from + (i + 1) * step) };
          });
    return { startMs, endMs, words: timed };
  });
}

/** Whether the project shows these subtitles (Kdenlive's Subtitles track), and makes it so. */
export function showSubtitles(pj: Project, file: string): boolean {
  const shown = pj.seq.children.find((n) => n.tag === "filter" && prop(n, "mlt_service") === "avfilter.subtitles");
  if (shown && prop(shown, "av.filename") === file) return false;
  if (shown) pj.seq.children.splice(pj.seq.children.indexOf(shown), 1);
  setProp(pj.seq, "kdenlive:sequenceproperties.subtitlesList", JSON.stringify([{ file, id: 0, name: "Subtitles" }]));
  setProp(pj.seq, "kdenlive:sequenceproperties.activeSubtitleIndex", 0);
  pj.addFilter(pj.seq, { mlt_service: "avfilter.subtitles", "av.filename": file, "av.alpha": "1", internal_added: "237", "kdenlive:locked": "0" });
  return true;
}
