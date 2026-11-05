import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ScreencastClip, Word } from "../types.ts";
import { loadProject, projectDir, toBox, toMs, type ClipFile, type ProjectFile, type Transcript } from "./project.ts";
import { cleanVoice, isFresh } from "./voice.ts";
import { ensureWhisper, toWhisperWav, whisperWords } from "./whisper.ts";

export type Edit = {
  name: string;
  project: ProjectFile;
  transcript: Transcript;
  /** The recording, its size, and its voice cleaned (see voice.ts). Absolute paths. */
  source: string;
  sourceSize: { width: number; height: number };
  voice: string;
  /** out/<name>, where everything made from the project goes. */
  outDir: string;
  clips: ScreencastClip[];
  screenDurationMs: number;
};

/**
 * Everything both renderers need from a project: the cleaned voice, and each kept clip
 * placed in the video with its camera moves and captions.
 */
export async function loadEdit(name: string): Promise<Edit> {
  const { project, transcript } = await loadProject(name);
  const source = path.resolve(project.source);
  if (!existsSync(source)) throw new Error(`Recording not found: ${project.source}`);
  const sourceSize = videoSize(source);
  const outDir = path.resolve("out", name);
  await mkdir(outDir, { recursive: true });

  const voice = path.join(outDir, "voice.wav");
  if (!isFresh(source, voice)) {
    console.log("cleaning the voice track");
    const { channel } = await cleanVoice(source, voice);
    console.log(`  using the ${channel} channel`);
  }

  let at = 0;
  const clips: ScreencastClip[] = [];
  for (const [i, c] of project.clips.entries()) {
    const fromMs = toMs(c.from);
    const toMsValue = toMs(c.to);
    if (toMsValue <= fromMs) throw new Error(`Clip ${i + 1}: "to" (${c.to}) must come after "from" (${c.from})`);
    const speed = c.speed ?? 1;
    const durationMs = Math.round((toMsValue - fromMs) / speed);
    const words =
      c.captions === false || speed !== 1
        ? []
        : await clipWords(name, voice, transcript, `clip ${i + 1}`, fromMs, toMsValue);
    clips.push({
      fromMs,
      toMs: toMsValue,
      speed,
      muted: speed !== 1,
      startMs: at,
      durationMs,
      cams: cams(c, speed),
      words: applyReplacements(words, project.replace ?? {}),
    });
    at += durationMs;
  }

  return { name, project, transcript, source, sourceSize, voice, outDir, clips, screenDurationMs: at };
}

/**
 * Captions for one clip: its own audio, transcribed on its own. Over a whole recording
 * Whisper's timings drift wherever there is silence; a short clip comes back on time.
 * Cached by the clip's range, so moving one clip re-transcribes only that one.
 */
async function clipWords(name: string, voice: string, transcript: Transcript, label: string, fromMs: number, toMsValue: number): Promise<Word[]> {
  const cache = path.join(projectDir(name), "clips", `${fromMs}-${toMsValue}.json`);
  if (existsSync(cache)) return JSON.parse(await readFile(cache, "utf8"));
  await ensureWhisper();
  console.log(`transcribing ${label}`);
  await mkdir(path.dirname(cache), { recursive: true });
  const wav = cache.replace(/\.json$/, ".wav");
  await toWhisperWav(voice, wav, { fromMs, toMs: toMsValue });
  const { words } = await whisperWords(wav, { lang: (transcript.language || "fi") });
  await rm(wav, { force: true });
  const timed = words
    .map((w) => ({ text: w.text, startMs: w.startMs, endMs: Math.min(w.endMs, toMsValue - fromMs) }))
    .filter((w) => w.startMs < toMsValue - fromMs);
  await writeFile(cache, JSON.stringify(timed));
  return timed;
}

/** The clip's camera moves, in video time. No zoom means the whole screen. */
function cams(c: ClipFile, speed: number): ScreencastClip["cams"] {
  if (!c.zoom) return [{ atMs: 0, box: null }];
  if (c.zoom === "full" || (Array.isArray(c.zoom) && typeof c.zoom[0] === "number")) {
    return [{ atMs: 0, box: toBox(c.zoom as Exclude<ClipFile["zoom"], undefined | { at: number }[]>) }];
  }
  const moves = (c.zoom as { at: number; zoom: Parameters<typeof toBox>[0] }[])
    .map((m) => ({ atMs: Math.round((m.at * 1000) / speed), box: toBox(m.zoom) }))
    .sort((a, b) => a.atMs - b.atMs);
  return moves[0]?.atMs === 0 ? moves : [{ atMs: 0, box: null }, ...moves];
}

/**
 * "outer view" → "Outerview": a phrase of one or more words, matched case-insensitively. Its
 * last word may go on with a hyphen: "audiview-tuotteesta" → "Outerview-tuotteesta".
 */
export function applyReplacements(words: Word[], replace: NonNullable<ProjectFile["replace"]>): Word[] {
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

function videoSize(file: string) {
  const r = spawnSync("npx", ["remotion", "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" });
  const [width, height] = (r.stdout.trim().split("\n").at(-1) ?? "").split(",").map(Number);
  if (!width || !height) throw new Error(`Couldn't read the size of ${file}`);
  return { width, height };
}
