// Render an edited screen recording from its project file.
//   npm run cut -- <project>            → out/<project>/<project>.mp4
//   npm run cut -- <project> --studio   preview and scrub in Remotion Studio
// <project> is a folder in projects/, made by `npm run transcribe`.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Language } from "@remotion/install-whisper-cpp";
import type { ScreencastClip, ScreencastManifest, Word } from "../types.ts";
import { loadProject, projectDir, toBox, toMs, type ClipFile, type ProjectFile } from "./project.ts";
import { cleanVoice, isFresh } from "./voice.ts";
import { ensureWhisper, toWhisperWav, whisperWords } from "./whisper.ts";

const FPS = 30;
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const name = args.find((a) => !a.startsWith("--"));
if (!name) throw new Error("Usage: npm run cut -- <project> [--studio]   (a folder in projects/)");

const { project, transcript } = await loadProject(name);
const source = path.resolve(project.source);
if (!existsSync(source)) throw new Error(`Recording not found: ${project.source}`);
const sourceSize = videoSize(source);
const outDir = path.resolve("out", name);
await mkdir(outDir, { recursive: true });

// --- the voice, cleaned --------------------------------------------------------------
const voice = path.join(outDir, "voice.wav");
if (!isFresh(source, voice)) {
  console.log("cleaning the voice track");
  const { channel } = await cleanVoice(source, voice);
  console.log(`  using the ${channel} channel`);
}

// --- clips ---------------------------------------------------------------------------
let at = 0;
const clips: ScreencastClip[] = [];
for (const [i, c] of project.clips.entries()) {
  const fromMs = toMs(c.from);
  const toMsValue = toMs(c.to);
  if (toMsValue <= fromMs) throw new Error(`Clip ${i + 1}: "to" (${c.to}) must come after "from" (${c.from})`);
  const speed = c.speed ?? 1;
  const durationMs = Math.round((toMsValue - fromMs) / speed);
  const words = c.captions === false || speed !== 1 ? [] : await clipWords(i, fromMs, toMsValue);
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

// --- public dir: the recording, voice, brand, music ------------------------------------
// A copy, not a link: Remotion copies the public folder when it bundles, and a symlink
// doesn't survive that.
const published = `source${path.extname(source)}`;
if (!isFresh(source, path.join(outDir, published))) await cp(source, path.join(outDir, published));
await cp(path.resolve("assets/brand"), path.join(outDir, "brand"), { recursive: true });
let music: string | undefined;
if (project.music) {
  if (existsSync(project.music)) {
    music = `music${path.extname(project.music)}`;
    await cp(path.resolve(project.music), path.join(outDir, music));
  } else console.log(`no music: ${project.music} not found`);
}

const manifest: ScreencastManifest = {
  fps: FPS,
  source: published,
  voice: "voice.wav",
  sourceSize,
  title: project.title,
  end: project.end,
  music,
  musicVolume: project.musicVolume ?? 0.12,
  screenDurationMs: at,
  clips,
};
const props = path.join(outDir, "manifest.json");
await writeFile(props, JSON.stringify(manifest));
const recorded = (transcript.words.at(-1)?.endMs ?? 0) / 1000;
console.log(`${clips.length} clips: ${(at / 1000).toFixed(1)}s, cut from ${recorded.toFixed(0)}s recorded`);

const remotionArgs = ["src/remotion/index.ts", `--public-dir=${outDir}`, `--props=${props}`];
if (flags.has("--studio")) {
  await run("npx", ["remotion", "studio", ...remotionArgs]);
} else {
  const mp4 = path.join(outDir, `${name}.mp4`);
  await run("npx", ["remotion", "render", remotionArgs[0], "Screencast", mp4, ...remotionArgs.slice(1), "--concurrency=50%"]);
  console.log(`\n${mp4}`);
}

// ---------------------------------------------------------------------------------------

/**
 * Captions for one clip: its own audio, transcribed on its own. Over a whole recording
 * Whisper's timings drift wherever there is silence; a short clip comes back on time.
 * Cached by the clip's range, so moving one clip re-transcribes only that one.
 */
async function clipWords(i: number, fromMs: number, toMsValue: number): Promise<Word[]> {
  const cache = path.join(projectDir(name!), "clips", `${fromMs}-${toMsValue}.json`);
  if (existsSync(cache)) return JSON.parse(await readFile(cache, "utf8"));
  await ensureWhisper();
  console.log(`transcribing clip ${i + 1}`);
  await mkdir(path.dirname(cache), { recursive: true });
  const wav = cache.replace(/\.json$/, ".wav");
  await toWhisperWav(voice, wav, { fromMs, toMs: toMsValue });
  const { words } = await whisperWords(wav, { lang: (transcript.language || "fi") as Language });
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

/** "outer view" → "Outerview": a phrase of one or more words, matched case-insensitively. */
function applyReplacements(words: Word[], replace: NonNullable<ProjectFile["replace"]>): Word[] {
  const bare = (t: string) => t.toLowerCase().replace(/[.,!?;:"]+$/u, "");
  const rules = Object.entries(replace).map(([from, to]) => ({ from: from.toLowerCase().split(/\s+/), to }));
  const out: Word[] = [];
  for (let i = 0; i < words.length; i++) {
    const rule = rules.find((r) => r.from.every((part, k) => words[i + k] && bare(words[i + k].text) === part));
    if (!rule) {
      out.push(words[i]);
      continue;
    }
    const last = words[i + rule.from.length - 1];
    const trailing = last.text.match(/[.,!?;:"]+$/u)?.[0] ?? "";
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

function run(cmd: string, argv: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: "inherit" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${argv[0]} exited with ${code}`))));
  });
}
