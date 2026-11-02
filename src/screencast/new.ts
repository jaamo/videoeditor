// A video from a screen recording, in a project of its own:
//   npm run new -- <name>
// A new project asks for its title, and waits for its footage. Then, or for a project made
// before, it asks which steps to do, in the order given:
//   1. initial cut  <name>.kdenlive: the footage without its silences and its retakes (a
//                   sentence said again, a false start, an "öö" on its own). A guide marks
//                   each cut, saying what was taken out.
//   2. edit         opens it in Kdenlive, to fine-tune the cuts or the captions' text; waits
//                   until you're done.
//   3. captions     the cut transcribed, as Kdenlive's subtitles (<name>.kdenlive.ass), for
//                   their text to be polished there. Remotion still draws them.
//   4. render       out.mp4, in Remotion: the intro, the cut with captions and music, the end.
//   5. sample       sample.mp4: a part of it, from and to the times you give, to check quickly.
//
// projects/<name>/
//   project.yaml    title, music, captions' language and spelling fixes
//   footage/        the recording, dropped in by you
//   tmp/            everything made along the way
//   <name>.kdenlive
//   <name>.kdenlive.ass
//   out.mp4
//   sample.mp4
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import YAML from "yaml";
import { finalDurationMs } from "../remotion/Final.tsx";
import type { FinalManifest, Word } from "../types.ts";
import { chunk, LINGER_MS } from "../remotion/Captions.tsx";
import { applyReplacements } from "./edit.ts";
import { Project, prop, setProp, type Filter } from "./kdenlive-xml.ts";
import { roughCut, type Removed } from "./rough-cut.ts";
import { run } from "./run.ts";
import { cleanVoice, isFresh } from "./voice.ts";
import { ensureWhisper, toWhisperWav, whisperWords } from "./whisper.ts";

const FPS = 30;
const W = 1920;
const H = 1080;
/** Fade the voice in and out at each cut, so the joins don't click. */
const VOICE_FADE_FRAMES = 2;
const VIDEO = /\.(mp4|mkv|mov|webm|avi)$/i;
/** How Whisper tends to hear the names, for a new project's captions to fix. */
const SPELLING = { Audiview: "Outerview", Audaview: "Outerview", Audioview: "Outerview", "outer view": "Outerview", Maija: "Maya", Maijan: "Mayan", Maijalle: "Mayalle" };

type Settings = { title: string; music?: string; musicVolume?: number; language?: string; replace?: Record<string, string> };

const name = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!name || !/^[\p{Ll}\p{N}][\p{Ll}\p{N}-]*$/u.test(name)) throw new Error("Usage: npm run new -- <name>   (lowercase letters, digits and dashes)");
const dir = path.resolve("projects", name);
const footageDir = path.join(dir, "footage");
const tmp = path.join(dir, "tmp");
const settingsFile = path.join(dir, "project.yaml");
const kdenliveFile = path.join(dir, `${name}.kdenlive`);
/** Where Kdenlive itself would keep the project's subtitles. */
const subtitleFile = `${kdenliveFile}.ass`;
const outFile = path.join(dir, "out.mp4");
const sampleFile = path.join(dir, "sample.mp4");
const voice = path.join(tmp, "voice.wav");
const rl = createInterface({ input: process.stdin, output: process.stdout });
// Ctrl+D or Ctrl+C at a question: stop there.
rl.on("close", () => process.exit(0));
// The prompt takes Ctrl+C as a key, at a question or not: stop, and stop what we started.
rl.on("SIGINT", () => process.exit(130));
const fr = (ms: number) => Math.round((ms / 1000) * FPS);
const msOf = (f: number) => (f / FPS) * 1000;
const rel = (p: string) => path.relative(process.cwd(), p);

let steps: number[];
if (!existsSync(dir)) {
  let title = "";
  while (!title) title = (await rl.question("Title of the video: ")).trim();
  await mkdir(footageDir, { recursive: true });
  await mkdir(tmp, { recursive: true });
  const settings: Settings = { title, music: "assets/music/She No Dull Beat - Nana Kwabena.mp3", musicVolume: 0.1, language: "fi", replace: SPELLING };
  await writeFile(settingsFile, `# ${name}: npm run new -- ${name}\n${YAML.stringify(settings)}`);
  console.log(`\nMade ${rel(dir)}/ (title and music in ${rel(settingsFile)})`);
  steps = [1, 2, 3, 2, 4];
} else {
  if (!existsSync(footageDir)) throw new Error(`${rel(dir)} is a project of npm run cut, not npm run new`);
  const footage = footageFiles();
  console.log(`\n${rel(dir)}/`);
  console.log(`  footage   ${footage.length ? footage.join(", ") : "none yet"}`);
  console.log(`  cut       ${existsSync(kdenliveFile) ? path.basename(kdenliveFile) : "not made yet"}`);
  console.log(`  captions  ${existsSync(subtitleFile) ? path.basename(subtitleFile) : "not added yet (made when rendering)"}`);
  console.log(`  video     ${existsSync(outFile) ? "out.mp4" : "not rendered yet"}`);
  const answer = await rl.question(
    "\nWhich steps?  1 initial cut   2 edit in Kdenlive   3 add captions   4 render out.mp4   5 render a sample\n(in the order to do them, for example 3 2 4, or Enter for none): ",
  );
  steps = (answer.match(/[1-5]/g)?.map(Number) ?? []).filter((n, i, all) => n !== all[i - 1]);
  if (!steps.length) {
    console.log("Nothing to do.");
    process.exit(0);
  }
  if (steps.includes(1) && existsSync(kdenliveFile)) {
    const sure = await rl.question(`The initial cut replaces ${path.basename(kdenliveFile)}, and your edits in it. Go on? [y/N] `);
    if (!/^y/i.test(sure.trim())) process.exit(0);
    await copyFile(kdenliveFile, path.join(tmp, `${name}.kdenlive.bak`));
  }
  if (steps[0] !== 1 && !existsSync(kdenliveFile)) throw new Error("There's no cut yet: do step 1 first");
  if (steps.includes(3) && existsSync(subtitleFile)) {
    const sure = await rl.question(`Adding captions replaces ${path.basename(subtitleFile)}, and your edits in it. Go on? [y/N] `);
    if (!/^y/i.test(sure.trim())) process.exit(0);
    await copyFile(subtitleFile, path.join(tmp, `${path.basename(subtitleFile)}.bak`));
  }
}

const settings = YAML.parse(await readFile(settingsFile, "utf8")) as Settings;
const footage = await waitForFootage();
if (!isFresh(footage, voice)) {
  console.log("cleaning the voice");
  await cleanVoice(footage, voice);
}

for (const step of steps) {
  if (step === 1) await initialCut();
  if (step === 2) await editInKdenlive();
  if (step === 3) await addCaptions();
  if (step === 4) await render();
  if (step === 5) await render({ sample: true });
}
rl.close();

// === 1. initial cut =======================================================================

async function initialCut() {
  const transcriptFile = path.join(tmp, "transcript.json");
  let words: Word[];
  if (isFresh(footage, transcriptFile)) words = JSON.parse(await readFile(transcriptFile, "utf8"));
  else {
    await ensureWhisper();
    console.log("transcribing the footage");
    const wav = path.join(tmp, "transcript.wav");
    await toWhisperWav(footage, wav);
    let shown = -1;
    ({ words } = await whisperWords(wav, {
      lang: (settings.language ?? "fi"),
      onProgress: (p) => {
        const pct = Math.floor(p * 10) * 10;
        if (pct > shown) console.log(`  ${(shown = pct)}%`);
      },
    }));
    await writeFile(transcriptFile, JSON.stringify(words));
  }

  console.log("cutting");
  const { keep, removed } = await roughCut(voice, words);
  const cut = Project.empty({
    width: W,
    height: H,
    fps: FPS,
    root: dir,
    tracks: [
      { name: "Voice", audio: true },
      { name: "Screen", audio: false },
    ],
  });
  const [voiceTrack, screenTrack] = cut.tracks;
  const screenClip = cut.addClip(path.basename(footage), footage, durationFrames(footage));
  const voiceClip = cut.addClip("Voice (cleaned)", voice, durationFrames(voice));
  const screen = [];
  const spoken = [];
  const groups: [number, number][][] = [];
  const guides: { pos: number; comment: string }[] = [];
  let at = 0;
  for (const [i, r] of keep.entries()) {
    const inF = fr(r.fromMs);
    const outF = fr(r.toMs) - 1;
    if (outF < inF) continue;
    screen.push({ at, producer: screenClip, inF, outF });
    spoken.push({ at, producer: voiceClip, inF, outF, filters: voiceFades(inF, outF) });
    groups.push([[1, at], [0, at]]);
    // What was taken out before this piece.
    const gap = removedBetween(removed, i === 0 ? 0 : keep[i - 1].toMs, r.fromMs);
    if (gap) guides.push({ pos: at, comment: gap });
    at += outF - inF + 1;
  }
  cut.place(screenTrack, screen);
  cut.place(voiceTrack, spoken);
  cut.setGroups(groups);
  cut.setGuides(guides);
  cut.setLength(cut.length);
  await writeFile(kdenliveFile, cut.toString());

  const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  const report = removed.map((r) => `${s(r.fromMs)}–${s(r.toMs)}  ${r.why}`).join("\n");
  await writeFile(path.join(tmp, "initial-cut.txt"), `${report}\n`);
  const kept = keep.reduce((n, r) => n + r.toMs - r.fromMs, 0);
  const retakes = removed.filter((r) => r.why !== "silence").length;
  console.log(`${keep.length} pieces, ${s(kept)} of ${s(msOf(durationFrames(footage)))}; ${retakes} retakes and fillers out (see tmp/initial-cut.txt)`);
  console.log(rel(kdenliveFile));
}

/** A guide's text: what was cut out between two kept pieces. */
function removedBetween(removed: Removed[], fromMs: number, toMs: number): string {
  const inGap = removed.filter((r) => r.toMs > fromMs - 50 && r.fromMs < toMs + 50);
  if (!inGap.length) return "";
  const said = inGap.filter((r) => r.why !== "silence").map((r) => r.why);
  return `cut ${((toMs - fromMs) / 1000).toFixed(1)}s${said.length ? `: ${said.join("; ")}` : ""}`;
}

/** Kdenlive's fade in and fade out, for a piece of the voice from frame `inF` to `outF`. */
function voiceFades(inF: number, outF: number): Filter[] {
  const fade = (id: string, a: number, b: number) =>
    ({ mlt_service: "volume", kdenlive_id: id, window: "75", max_gain: "20dB", gain: id === "fadein" ? "0" : "1", end: id === "fadein" ? "1" : "0", in: String(a), out: String(b) }) as Filter;
  return [fade("fadein", inF, inF + VOICE_FADE_FRAMES), fade("fadeout", outF - VOICE_FADE_FRAMES, outF)];
}

// === 2. edit ==============================================================================

async function editInKdenlive() {
  const flatpak = spawnSync("flatpak", ["info", "org.kde.kdenlive"], { stdio: "ignore" }).status === 0;
  const [cmd, ...args] = flatpak ? ["flatpak", "run", "org.kde.kdenlive"] : ["kdenlive"];
  const app = spawn(cmd, [...args, kdenliveFile], { detached: true, stdio: "ignore" });
  app.on("error", () => console.log(`Couldn't start Kdenlive: open ${rel(kdenliveFile)} in it yourself`));
  app.unref();
  const what = existsSync(subtitleFile) ? "the cuts, or the captions' text (on the Subtitles track)" : "the cuts";
  await rl.question(`\nFine-tune ${what} in Kdenlive (${path.basename(kdenliveFile)}), save, then press Enter. `);
}

// === 3. captions ==========================================================================

/**
 * The cut's captions as Kdenlive's subtitles, a line each, to polish their text there. Cutting
 * again after this moves the voice under them: add them again.
 */
async function addCaptions() {
  const { cut, audio, cutMs } = await timeline();
  const words = applyReplacements(await captions(audio, cutMs), settings.replace ?? {});
  const lines = chunk(words);
  const t = (ms: number) => {
    const cs = Math.round(ms / 10);
    return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
  };
  const events = lines.map((l, i) => {
    const end = Math.min(l.at(-1)!.endMs + LINGER_MS, lines[i + 1]?.[0].startMs ?? Infinity);
    return `Dialogue: 0,${t(l[0].startMs)},${t(end)},Default,,0,0,0,,${l.map((w) => w.text).join(" ")}`;
  });
  // Kdenlive's preview only: the video's captions are drawn by Remotion, in its own style.
  await writeFile(
    subtitleFile,
    `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n` +
      "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n" +
      "Style: Default,Sans,54,&H00FFFFFF,&H00FFFFFF,&H24111111,&H24111111,-1,0,0,0,100,100,0,0,3,20,0,2,210,210,110,1\n\n" +
      `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join("\n")}\n`,
  );
  setProp(cut.seq, "kdenlive:sequenceproperties.subtitlesList", JSON.stringify([{ file: subtitleFile, id: 0, name: "Subtitles" }]));
  setProp(cut.seq, "kdenlive:sequenceproperties.activeSubtitleIndex", 0);
  const old = cut.seq.children.findIndex((n) => n.tag === "filter" && prop(n, "mlt_service") === "avfilter.subtitles");
  if (old >= 0) cut.seq.children.splice(old, 1);
  cut.addFilter(cut.seq, { mlt_service: "avfilter.subtitles", "av.filename": subtitleFile, "av.alpha": "1", internal_added: "237", "kdenlive:locked": "0" });
  await copyFile(kdenliveFile, path.join(tmp, `${name}.kdenlive.before-captions`));
  await writeFile(kdenliveFile, cut.toString());
  console.log(`${lines.length} captions in ${rel(subtitleFile)}: their text can be fixed in Kdenlive (step 2)`);
}

/** The captions as polished in Kdenlive: each line's words, timed as said where they still match. */
async function kdenliveCaptions(words: Word[]): Promise<{ endMs: number; words: Word[] }[]> {
  const clockMs = (c: string) => {
    const [h, m, sec] = c.split(":").map(Number);
    return Math.round(((h * 60 + m) * 60 + sec) * 1000);
  };
  const out: { endMs: number; words: Word[] }[] = [];
  for (const line of (await readFile(subtitleFile, "utf8")).split(/\r?\n/)) {
    if (!line.startsWith("Dialogue:")) continue;
    const f = line.slice("Dialogue:".length).split(",");
    const [startMs, endMs] = [clockMs(f[1].trim()), clockMs(f[2].trim())];
    const text = f.slice(9).join(",").replace(/\{[^}]*\}/g, "").replace(/\\[Nnh]/g, " ");
    const tokens = text.split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const said = words.filter((w) => (w.startMs + w.endMs) / 2 >= startMs && (w.startMs + w.endMs) / 2 < endMs);
    const timed =
      said.length === tokens.length
        ? tokens.map((text, i) => ({ ...said[i], text }))
        : tokens.map((text, i) => {
            // Words added or taken out: spread over the line.
            const from = said[0]?.startMs ?? startMs;
            const to = said.at(-1)?.endMs ?? endMs - LINGER_MS;
            const step = Math.max(0, to - from) / tokens.length;
            return { text, startMs: Math.round(from + i * step), endMs: Math.round(from + (i + 1) * step) };
          });
    out.push({ endMs, words: timed });
  }
  return out;
}

// === 4. render ============================================================================

/** The cut as it is in Kdenlive: its picture and its voice, placed on the timeline. */
async function timeline() {
  const cut = new Project(await readFile(kdenliveFile, "utf8"));
  const ms = (f: number) => (f / cut.fps) * 1000;
  const video = cut.tracks
    .filter((t) => !t.audio)
    .flatMap((t) => t.clips.filter((c) => c.resource === footage))
    .map((c) => ({ atMs: ms(c.at), fromMs: ms(c.inF * c.speed), durationMs: ms(c.outF - c.inF + 1), speed: c.speed }));
  const audio = cut.tracks
    .filter((t) => t.audio)
    .flatMap((t) => t.clips.filter((c) => c.resource === voice && c.speed === 1))
    .map((c) => ({ atMs: ms(c.at), fromMs: ms(c.inF), durationMs: ms(c.outF - c.inF + 1) }));
  if (!video.length) throw new Error(`No clips of ${path.basename(footage)} in ${path.basename(kdenliveFile)}`);
  return { cut, video, audio, cutMs: ms(cut.length) };
}

/** The whole video, or with `sample`, the part of it asked for. */
async function render({ sample = false } = {}) {
  const { video, audio, cutMs } = await timeline();

  // Everything Remotion shows, in its public folder. Copies: a link doesn't survive its bundling.
  const pub = path.join(tmp, "public");
  await mkdir(pub, { recursive: true });
  const published = `footage${path.extname(footage)}`;
  if (!isFresh(footage, path.join(pub, published))) await copyFile(footage, path.join(pub, published));
  if (!isFresh(voice, path.join(pub, "voice.wav"))) await copyFile(voice, path.join(pub, "voice.wav"));
  await cp(path.resolve("assets/brand"), path.join(pub, "brand"), { recursive: true });
  await cp(path.resolve("assets/titles"), pub, { recursive: true });
  let music: string | undefined;
  if (settings.music && existsSync(settings.music)) {
    music = `music${path.extname(settings.music)}`;
    await copyFile(settings.music, path.join(pub, music));
  } else if (settings.music) console.log(`no music: ${settings.music} not found`);

  const words = applyReplacements(await captions(audio, cutMs), settings.replace ?? {});
  const lines = existsSync(subtitleFile) ? await kdenliveCaptions(words) : undefined;
  if (lines) console.log(`captions from ${rel(subtitleFile)}`);
  const manifest: FinalManifest = { fps: FPS, title: settings.title, footage: published, voice: "voice.wav", music, musicVolume: settings.musicVolume ?? 0.1, video, audio, cutMs, words, lines };
  const props = path.join(tmp, "manifest.json");
  await writeFile(props, JSON.stringify(manifest));
  const total = fr(finalDurationMs(manifest));
  let frames: string[] = [];
  if (sample) {
    const [from, to] = await askRange(msOf(total));
    frames = [`--frames=${Math.min(fr(from), total - 1)}-${Math.max(fr(from), Math.min(fr(to), total) - 1)}`];
    console.log(`rendering ${clock(from)}–${clock(Math.min(to, msOf(total)))} of the video`);
  } else console.log(`rendering ${(cutMs / 1000).toFixed(1)}s of cut, ${words.length} words of captions`);
  const file = sample ? sampleFile : outFile;
  await run("npx", ["remotion", "render", "src/remotion/index.ts", "Final", file, `--props=${props}`, `--public-dir=${pub}`, ...frames,
    // A long render with many browser tabs runs out of memory: fewer tabs, a bounded frame cache.
    "--concurrency=4", "--offthreadvideo-cache-size-in-bytes=1000000000", "--timeout=120000"]);
  console.log(`\n${rel(file)}`);
}

/** From and to, in ms of the video: asked as 1:05 or 65 (or 65.5), the whole of it by default. */
async function askRange(lengthMs: number): Promise<[number, number]> {
  console.log(`\nThe video is ${clock(lengthMs)} long (intro and end card included).`);
  const ask = async (q: string, fallback: number) => {
    for (;;) {
      const a = (await rl.question(`${q} [${clock(fallback)}]: `)).trim();
      if (!a) return fallback;
      const m = a.match(/^(?:(\d+):)?(\d+(?:[.,]\d+)?)$/);
      if (m) return Math.min(lengthMs, ((Number(m[1] ?? 0) * 60) + Number(m[2].replace(",", "."))) * 1000);
      console.log("  as 1:05 or 65, please");
    }
  };
  const from = await ask("Start", 0);
  let to = await ask("End", lengthMs);
  while (to <= from) to = await ask(`End, after ${clock(from)}`, lengthMs);
  return [from, to];
}

function clock(ms: number) {
  const s = ms / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}

/**
 * Captions for the cut: its voice, as heard in it, transcribed in one go. With its pauses cut
 * out, Whisper keeps time across all of it. Cached by the cut of the voice.
 */
async function captions(audio: FinalManifest["audio"], cutMs: number): Promise<Word[]> {
  const key = createHash("sha1").update(JSON.stringify(audio)).digest("hex").slice(0, 12);
  const cache = path.join(tmp, `captions-${key}.json`);
  if (existsSync(cache)) return JSON.parse(await readFile(cache, "utf8"));
  const wav = path.join(tmp, "cut-voice.wav");
  await writeFile(wav, await cutVoice(audio, cutMs));
  const small = path.join(tmp, "cut-voice.16k.wav");
  await toWhisperWav(wav, small);
  await ensureWhisper();
  console.log("transcribing the cut for captions");
  const { words } = await whisperWords(small, { lang: (settings.language ?? "fi") });
  await writeFile(cache, JSON.stringify(words));
  return words;
}

/** The voice as the cut plays it: its pieces at their places, silence between. */
async function cutVoice(audio: FinalManifest["audio"], cutMs: number): Promise<Buffer> {
  const src = await readFile(voice);
  const rate = src.readUInt32LE(24);
  const data = src.indexOf("data", 12, "ascii") + 8;
  const at = (ms: number) => Math.round((ms / 1000) * rate);
  const out = Buffer.alloc(44 + at(cutMs) * 2);
  src.copy(out, 0, 0, 44);
  out.writeUInt32LE(36 + at(cutMs) * 2, 4);
  out.writeUInt32LE(at(cutMs) * 2, 40);
  for (const a of audio) {
    const from = data + at(a.fromMs) * 2;
    const n = Math.min(at(a.durationMs), at(cutMs) - at(a.atMs)) * 2;
    src.copy(out, 44 + at(a.atMs) * 2, from, Math.min(src.length, from + n));
  }
  return out;
}

// ---------------------------------------------------------------------------------------

function footageFiles() {
  return existsSync(footageDir) ? readdirSync(footageDir).filter((f) => VIDEO.test(f)).sort() : [];
}

/** The one recording in footage/, once it's there. */
async function waitForFootage(): Promise<string> {
  for (;;) {
    const files = footageFiles();
    if (files.length === 1) return path.join(footageDir, files[0]);
    const why = files.length ? `There are ${files.length} videos in footage/: leave only one.` : "Drop the recording into footage/.";
    await rl.question(`\n${why} (${rel(footageDir)})  Then press Enter. `);
  }
}

function durationFrames(file: string) {
  const r = spawnSync("npx", ["remotion", "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  const seconds = Number(r.stdout.trim().split("\n").at(-1));
  if (!seconds) throw new Error(`Couldn't read the length of ${file}`);
  return Math.floor(seconds * FPS);
}
