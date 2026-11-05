// The work the agents hand off: exact, slow, or paid for, so done by code, once.
//   npm run short -- init <name>                folders and project.yaml
//   npm run short -- sort <name> [file=camera|broll|screen|skip …]   files dropped in the project: what they look like, then into footage/
//   npm run short -- analyze <name> [--force]   voice, transcript, silences, a first cut, contact sheets
//   npm run short -- frame <name> <main|cut|out|sample|broll/…|screen/…> <seconds> [x,y,w,h]
//   npm run short -- level <name> <from> <to>   the clean voice's loudness, to cut in the quiet
//   npm run short -- check <name>               the plan's problems
//   npm run short -- kdenlive <name> [--force]  the plan as <name>.kdenlive (phase 1)
//   npm run short -- open <name>                opens it in Kdenlive (phase 2)
//   npm run short -- captions <name> [--force]  the cut's captions, to captions.txt (phase 3)
//   npm run short -- render <name> [--sample <from> <to>]   out.mp4 (or sample.mp4)
//   npm run short -- review <name> [--sample]   checks of the video: heard against captions, sound, frames
// Times are seconds of the camera recording, except where they're of the cut or the video.
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, link, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { cutKeyOf, readCaptions, writeCaptions } from "./captions.ts";
import { writeRect } from "./keys.ts";
import { roughCut } from "./lib/rough-cut.ts";
import { run } from "./lib/run.ts";
import { contactSheets, durationOf, ff, ffReport, fingerprint, kdenliveFrame, levels, probe, readWav, still } from "./lib/media.ts";
import { makeVoice } from "./lib/voice.ts";
import { ensureWhisper, toWhisperWav, whisperWords } from "./lib/whisper.ts";
import {
  applyReplacements, buildCut, checkPlan, clock, footageOf, H, IMAGE, VIDEO, LOUD_AT_CUT_DB, msOf, paths, projectFps, readCut, readJson, readYaml, seconds, transcriptText, W,
  type Cut, type Plan, type Settings, type Summary,
} from "./project.ts";
import type { ShortManifest, Word } from "./types.ts";

const SPELLING = { "kampi apina": "Kampiapina", "kampiapina": "Kampiapina", "kampi-apina": "Kampiapina" };

const [cmd, name, ...rest] = process.argv.slice(2);
if (!cmd || !name || !/^[\p{Ll}\p{N}][\p{Ll}\p{N}-]*$/u.test(name)) {
  console.error("Usage: npm run short -- <init|sort|analyze|frame|level|check|kdenlive|open|captions|render|review> <name>  (name: lowercase letters, digits, dashes)");
  process.exit(2);
}
const p = paths(name);
const log = (s: string) => console.log(s);
const rel = (f: string) => path.relative(process.cwd(), f);
const s1 = (ms: number) => Math.round(ms / 100) / 10;

const commands: Record<string, () => Promise<void>> = { init, sort, analyze, frame, level, check, kdenlive, open, captions, render, review };
if (!commands[cmd]) throw new Error(`Unknown command ${cmd}`);
if (cmd !== "init" && !existsSync(p.dir)) throw new Error(`No project ${rel(p.dir)}: npm run short -- init ${name}`);
await commands[cmd]();

// --- init ------------------------------------------------------------------------------

async function init() {
  await ensureProject();
  log(`${rel(p.dir)}/: drop the files in it (the camera recording, b-roll, screen recordings), and they're sorted into footage/ by what they are`);
}

async function ensureProject() {
  for (const d of [p.footage, path.join(p.footage, "broll"), path.join(p.footage, "screen")]) await mkdir(d, { recursive: true });
  if (!existsSync(p.settings)) {
    const settings: Settings = { language: "fi", grade: 1, musicVolume: 0.08, replace: SPELLING };
    await writeFile(
      p.settings,
      `# ${name}: settings of the short (see /make-short)\n${YAML.stringify(settings)}` +
        "# music: assets/music/track.mp3   # a track under the voice, ducked while speaking\n",
    );
  }
}

// --- sort ------------------------------------------------------------------------------

/**
 * Footage dropped anywhere in the project, not yet in its place: files in the project's own
 * folder, and in footage/ itself when there's more than one video there (the camera is one).
 */
async function loose() {
  const media = new RegExp(`${VIDEO.source}|${IMAGE.source}`, "i");
  const inDir = async (d: string) => (existsSync(d) ? (await readdir(d, { withFileTypes: true })).filter((e) => e.isFile() && media.test(e.name)).map((e) => path.join(d, e.name)) : []);
  const top = (await inDir(p.dir)).filter((f) => f !== p.out && f !== p.sample);
  const inFootage = await inDir(p.footage);
  const unsure = inFootage.filter((f) => VIDEO.test(f)).length > 1 || inFootage.some((f) => IMAGE.test(f));
  return [...top, ...(unsure || top.length ? inFootage : [])].sort();
}

async function sort() {
  await ensureProject();
  const files = await loose();
  const byName = new Map(files.map((f) => [path.relative(p.dir, f), f]));
  if (!rest.length) {
    if (!files.length) return log("nothing to sort: the footage is in place");
    // What each looks like, for whoever decides: its size, length, sound, and a few frames.
    const dir = path.join(p.analysis, "sort");
    await mkdir(dir, { recursive: true });
    log(`${files.length} files to sort (camera: the talking head, one file; broll: other footage and stills; screen: screen recordings; skip: not footage):`);
    for (const [key, f] of byName) {
      if (IMAGE.test(f)) {
        log(`\n${key}: a still image\n  look: ${rel(f)}`);
        continue;
      }
      const r = probe(f);
      let sound = "no sound";
      if (r.hasAudio) {
        const quiet = await ffReport(["-i", f, "-vn", "-af", "silencedetect=noise=-35dB:d=0.5", "-f", "null", "-"]);
        const silent = [...quiet.matchAll(/silence_duration: ([\d.]+)/g)].reduce((a, m) => a + Number(m[1]), 0) * 1000;
        sound = `sound ${Math.round(Math.max(0, 1 - silent / r.durationMs) * 100)} % of the time (speech or anything loud)`;
      }
      const every = Math.max(1, r.durationMs / 8000);
      const [sheet] = await contactSheets(f, r.durationMs, path.join(dir, key.replace(/[/. ]/g, "_")), every, { cols: 4, rows: 2, tileWidth: r.height > r.width ? 240 : 400 });
      log(`\n${key}: ${r.width}×${r.height} ${r.fps.toFixed(2)} fps, ${clock(r.durationMs)}, ${sound}\n  look: ${rel(sheet.file)} (frames at ${sheet.times.join(", ")} s)`);
    }
    log(`\nThen: npm run -s short -- sort ${name} "<file>=camera" "<file>=broll" …  (every file, a role each)`);
    return;
  }
  const roles = rest.map((a) => {
    const at = a.lastIndexOf("=");
    const [key, role] = [a.slice(0, at), a.slice(at + 1)];
    if (at < 0 || !["camera", "broll", "screen", "skip"].includes(role)) throw new Error(`${a}: give <file>=camera|broll|screen|skip`);
    const file = byName.get(key) ?? byName.get(path.basename(key));
    if (!file) throw new Error(`${key} isn't one of the files to sort: ${[...byName.keys()].join(", ") || "(none)"}`);
    return { file, role };
  });
  const left = files.filter((f) => !roles.some((r) => r.file === f));
  if (left.length) throw new Error(`No role for ${left.map((f) => path.relative(p.dir, f)).join(", ")}`);
  const cameras = roles.filter((r) => r.role === "camera");
  const inPlace = (await readdir(p.footage)).filter((f) => VIDEO.test(f)).map((f) => path.join(p.footage, f)).filter((f) => !files.includes(f));
  if (cameras.length + inPlace.length !== 1) throw new Error(`The camera is one file: ${[...inPlace, ...cameras.map((r) => r.file)].map((f) => path.relative(p.dir, f)).join(", ") || "none given"}`);
  if (cameras.some((r) => !VIDEO.test(r.file))) throw new Error("The camera is a video");
  const skipped = path.join(p.dir, "unused");
  for (const { file, role } of roles) {
    const to = role === "camera" ? p.footage : role === "skip" ? skipped : path.join(p.footage, role);
    await mkdir(to, { recursive: true });
    const dest = path.join(to, path.basename(file));
    if (dest === file) continue;
    if (existsSync(dest)) throw new Error(`${rel(dest)} is there already`);
    await rename(file, dest);
    log(`${path.relative(p.dir, file)} → ${path.relative(p.dir, dest)}`);
  }
}

// --- analyze ---------------------------------------------------------------------------

async function analyze() {
  const force = rest.includes("--force");
  const settings = await loadSettings();
  const unsorted = await loose();
  if (unsorted.length) throw new Error(`Not sorted yet: ${unsorted.map((f) => path.relative(p.dir, f)).join(", ")}. First: npm run -s short -- sort ${name}`);
  const { main, inserts } = footageOf(p, probe);
  if (!main) throw new Error(`No camera recording in ${rel(p.footage)}/`);
  if (!main.hasAudio) throw new Error(`${path.basename(main.file)} has no sound: there's no voice to cut by`);
  const files = [main, ...Object.values(inserts)];
  const inputs = Object.fromEntries(files.map((x) => [path.relative(p.footage, x.file), fingerprint(x.file)]));
  const old = existsSync(p.summary) ? await readJson<Summary>(p.summary) : undefined;
  const mainKey = path.relative(p.footage, main.file);
  // A new camera recording is a new analysis; new b-roll only new sheets.
  if (force || (old && old.inputs[mainKey] !== inputs[mainKey])) {
    log(force ? "analysis: starting over (--force)" : "analysis: the camera recording changed, starting over");
    await rm(p.analysis, { recursive: true, force: true });
  }
  for (const d of [p.analysis, p.sheets, p.frames, p.tmp]) await mkdir(d, { recursive: true });
  const summary: Summary = { fps: projectFps(main.fps), main, inserts, inputs };
  await writeFile(p.summary, JSON.stringify(summary, null, 2));

  if (!existsSync(p.voice)) await makeVoice(main.file, p.voice, log);
  else log("voice: done before");

  if (!existsSync(p.silences)) {
    const quiet = await ffReport(["-i", p.voice, "-af", "silencedetect=noise=-40dB:d=0.12", "-f", "null", "-"]);
    const list = [...quiet.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)].map((m) => [Math.round(Number(m[1]) * 100) / 100, Math.round(Number(m[2]) * 100) / 100]);
    await writeFile(p.silences, JSON.stringify({ about: "Stretches of 0.12 s or more where the clean voice is under -40 dB, [from, to] in seconds of the camera recording. Cut inside these.", silences: list }));
  }

  let words: Word[];
  const whisperFile = path.join(p.analysis, "transcript.whisper.json");
  if (existsSync(p.transcript) && existsSync(whisperFile)) {
    words = await readJson<Word[]>(p.transcript);
    log("transcript: done before");
  } else {
    await ensureWhisper();
    const small = path.join(p.tmp, "voice.16k.wav");
    await toWhisperWav(p.voice, small);
    let raw: Word[];
    if (existsSync(whisperFile)) raw = await readJson<Word[]>(whisperFile);
    else {
      log(`transcript: OpenAI Whisper (${(main.durationMs / 60000).toFixed(1)} min, about $${((main.durationMs / 60000) * 0.006).toFixed(2)})`);
      ({ words: raw } = await whisperWords(small, { lang: settings.language ?? "fi" }));
    }
    await writeFile(whisperFile, JSON.stringify(raw));
    const silences = (await readJson<{ silences: [number, number][] }>(p.silences)).silences;
    const gaps = await fillGaps(raw, silences, main.durationMs, small, settings.language ?? "fi");
    words = gaps.words;
    await writeFile(path.join(p.analysis, "transcript-gaps.json"), JSON.stringify({
      about: "Speech Whisper left out the first time, transcribed again on its own and added. Seconds of the camera recording. Check these: Whisper may also invent words over noise.",
      added: gaps.added,
    }, null, 1));
    await writeFile(p.transcript, JSON.stringify(words));
  }
  await writeFile(p.transcriptText, transcriptText(words));

  if (!existsSync(p.cuts)) {
    const { keep, removed } = await roughCut(p.voice, words);
    await writeFile(p.cuts, JSON.stringify({
      about: "A first guess at what to keep, in seconds of the camera recording: speech without pauses over 1 s, retakes and lone fillers. A starting point, not the plan.",
      keep: keep.map((r) => [s1(r.fromMs), s1(r.toMs)]),
      removed: removed.map((r) => ({ from: s1(r.fromMs), to: s1(r.toMs), why: r.why })),
    }, null, 1));
  }

  // Contact sheets: the camera every 5 s, each insert every 1–5 s by its length.
  const sheets = await readdir(p.sheets);
  const indexFile = path.join(p.sheets, "index.txt");
  const index: string[] = existsSync(indexFile) ? (await readFile(indexFile, "utf8")).split("\n").slice(1).filter(Boolean) : [];
  const todo: [string, typeof main, number][] = [["main", main, 5]];
  for (const [key, ins] of Object.entries(inserts)) if (!IMAGE.test(key)) todo.push([key.replace(/[/.]/g, "_"), ins, Math.max(1, Math.min(5, Math.round(ins.durationMs / 16000)))]);
  for (const [prefix, r, every] of todo) {
    if (sheets.some((f) => f.startsWith(`${prefix}-`))) continue;
    log(`sheets: ${prefix}, a frame every ${every} s`);
    const portrait = r.height > r.width;
    const cols = portrait ? 8 : 4;
    const made = await contactSheets(r.file, r.durationMs, path.join(p.sheets, prefix), every, { tileWidth: portrait ? 240 : 480, cols, rows: portrait ? 2 : 4 });
    index.push(...made.map((m) => `${path.basename(m.file)}: ${cols} a row, left to right, at ${m.times.join(", ")} s of ${prefix === "main" ? "the camera recording" : path.relative(p.footage, r.file)}`));
  }
  if (index.length) await writeFile(indexFile, `Seconds of each file's own time.\n${index.join("\n")}\n`);

  log(`\n${rel(p.analysis)}/`);
  for (const f of (await readdir(p.analysis)).sort()) log(`  ${f}`);
  log(`camera: ${path.basename(main.file)}, ${main.width}×${main.height} ${main.fps.toFixed(2)} fps, ${clock(main.durationMs)} (the short is ${summary.fps} fps)`);
  const ins = Object.keys(inserts);
  log(`inserts: ${ins.length ? ins.join(", ") : "none"}`);
}

/**
 * Whisper sometimes leaves out a stretch of speech (after a long silence, under other sound).
 * Where the voice is heard (between `silences`) but no word is, it's transcribed again on
 * its own and the words put in.
 */
async function fillGaps(words: Word[], silences: [number, number][], durationMs: number, wav: string, lang: string) {
  const sound: [number, number][] = [];
  let at = 0;
  for (const [a, b] of [...silences.map(([x, y]) => [x * 1000, y * 1000] as const), [durationMs, durationMs] as const]) {
    if (a - at > 0) {
      if (sound.length && at - sound.at(-1)![1] < 500) sound.at(-1)![1] = a;
      else sound.push([at, a]);
    }
    at = b;
  }
  const STEP = 250;
  const hasWord = (t: number) => words.some((w) => w.startMs < t + STEP && Math.max(w.endMs, w.startMs + 200) > t);
  const missing: [number, number][] = [];
  const push = (r: [number, number]) => {
    if (missing.length && r[0] - missing.at(-1)![1] < 1000) missing.at(-1)![1] = r[1];
    else missing.push(r);
  };
  for (const [a, b] of sound) {
    let run: [number, number] | undefined;
    for (let t = a; t < b; t += STEP) {
      if (hasWord(t)) {
        if (run && run[1] - run[0] >= 800) push(run);
        run = undefined;
      } else run = run ? [run[0], Math.min(b, t + STEP)] : [t, Math.min(b, t + STEP)];
    }
    if (run && run[1] - run[0] >= 800) push(run);
  }
  const added: { from: number; to: number; text: string }[] = [];
  const all = [...words];
  for (const [a, b] of missing) {
    const from = Math.max(0, a - 300);
    const piece = path.join(p.tmp, "gap.16k.wav");
    await toWhisperWav(wav, piece, { fromMs: from, toMs: Math.min(durationMs, b + 300) });
    const { words: got } = await whisperWords(piece, { lang });
    const fresh = got
      .map((w) => ({ text: w.text, startMs: w.startMs + from, endMs: w.endMs + from }))
      .filter((w) => {
        const mid = (w.startMs + w.endMs) / 2;
        return mid >= a - 200 && mid <= b + 200 && !words.some((x) => (x.startMs + x.endMs) / 2 >= w.startMs - 50 && (x.startMs + x.endMs) / 2 <= w.endMs + 50);
      });
    if (!fresh.length) continue;
    all.push(...fresh);
    added.push({ from: s1(a), to: s1(b), text: fresh.map((w) => w.text).join(" ") });
  }
  if (missing.length) log(`transcript: ${missing.length} stretches of speech without words, transcribed again: ${added.length} filled, ${all.length - words.length} words added`);
  return { words: all.sort((x, y) => x.startMs - y.startMs), added };
}

// --- frame -----------------------------------------------------------------------------

async function frame() {
  const [what, at, box] = rest;
  if (!what || at === undefined) throw new Error("Usage: npm run short -- frame <name> <main|cut|out|sample|broll/…|screen/…> <seconds> [x,y,w,h]");
  const ms = Math.round(seconds(at) * 1000);
  const b = box ? (box.split(/[ ,]+/).map(Number) as [number, number, number, number]) : undefined;
  const name = `${what.replace(/[/.]/g, "_")}-${(ms / 1000).toFixed(1)}${b ? "-box" : ""}`;
  let dir = p.frames;
  if (what === "cut") {
    // As Kdenlive draws it: framing, zooms and inserts as they are in the project now.
    if (!existsSync(p.kdenlive)) throw new Error(`No ${rel(p.kdenlive)} yet: npm run short -- kdenlive ${p.name}`);
    const cut = await readCut(p.kdenlive);
    const out = path.join(p.frames, `${name}.png`);
    await mkdir(p.frames, { recursive: true });
    await kdenliveFrame(p.kdenlive, Math.round((ms / 1000) * cut.fps), out);
    log(rel(out));
    return;
  }
  let file: string;
  if (what === "out" || what === "sample") {
    file = what === "out" ? p.out : p.sample;
    dir = path.join(p.review, "frames");
  } else {
    const summary = await readJson<Summary>(p.summary);
    const src = what === "main" ? summary.main : summary.inserts[what];
    if (!src) throw new Error(`No ${what}: main, cut, out, sample, or one of ${Object.keys(summary.inserts).join(", ") || "(no inserts)"}`);
    file = src.file;
  }
  await mkdir(dir, { recursive: true });
  const out = path.join(dir, `${name}.jpg`);
  // Full size, so a point read off it is in the file's own pixels.
  await still(file, ms, out, { box: b });
  log(rel(out));
}

// --- level -----------------------------------------------------------------------------

async function level() {
  const [fromS, toS] = rest;
  if (fromS === undefined || toS === undefined) throw new Error("Usage: npm run short -- level <name> <from> <to>  (seconds of the camera recording)");
  const at = await levels(p.voice);
  const from = Math.round(seconds(fromS) * 1000);
  const to = Math.min(from + 30_000, Math.round(seconds(toS) * 1000));
  log(`dBFS of ${rel(p.voice)} (speech about -20, quiet under -45, cuts are heard over ${LOUD_AT_CUT_DB}):`);
  for (let ms = from; ms <= to; ms += 50) {
    const db = at(ms);
    log(`${(ms / 1000).toFixed(2).padStart(7)}  ${String(Math.round(db)).padStart(4)}  ${"█".repeat(Math.max(0, Math.round((db + 70) / 2.5)))}`);
  }
}

// --- check -----------------------------------------------------------------------------

async function check() {
  const { summary, plan, words } = await loadPlan();
  const problems = checkPlan(plan, summary, words, await levels(p.voice));
  for (const x of problems) log(`${x.level === "error" ? "ERROR  " : "warning"} ${x.where}: ${x.what}`);
  if (!problems.some((x) => x.level === "error")) {
    let at = 0;
    for (const [i, s] of plan.segments.entries()) {
      const [from, to] = [msOf(s.from), msOf(s.to)];
      const text = words.filter((w) => Math.min(to, w.endMs) - Math.max(from, w.startMs) > (w.endMs - w.startMs) / 2).map((w) => w.text).join(" ");
      const extra = [s.emphasis?.length ? `${s.emphasis.length} zoom` : "", s.inserts?.length ? `${s.inserts.length} insert` : ""].filter(Boolean).join(", ");
      log(`  ${String(i + 1).padStart(2)}. ${clock(at)} ${extra.padEnd(18)} "${text.length > 80 ? `${text.slice(0, 77)}…` : text}"`);
      at += to - from;
    }
    log(`\n${plan.segments.length} segments, cut ${clock(at)}`);
  }
  if (problems.some((x) => x.level === "error")) process.exit(1);
  log(problems.length ? "no errors (see the warnings)" : "no problems");
}

// --- kdenlive (phase 1) ----------------------------------------------------------------

async function kdenlive() {
  const { summary, plan, words } = await loadPlan();
  const errors = checkPlan(plan, summary, words).filter((x) => x.level === "error");
  if (errors.length) throw new Error(`The plan has errors: npm run short -- check ${name}\n${errors.map((e) => `  ${e.where}: ${e.what}`).join("\n")}`);
  if (existsSync(p.kdenlive)) {
    if (!rest.includes("--force")) throw new Error(`${rel(p.kdenlive)} is there already, maybe with edits made by hand: --force replaces it (keeping a copy in tmp/)`);
    await mkdir(p.tmp, { recursive: true });
    const backup = path.join(p.tmp, `${name}.${Date.now()}.kdenlive`);
    await copyFile(p.kdenlive, backup);
    log(`the one before: ${rel(backup)}`);
  }
  const framesOf = (f: string) => Math.floor((durationOf(f) / 1000) * summary.fps);
  const cut = buildCut({ plan, summary, voice: p.voice, root: p.dir, writeRect, framesOf });
  await writeFile(p.kdenlive, cut.toString());
  const zooms = plan.segments.reduce((n, s) => n + (s.emphasis?.length ?? 0), 0);
  const inserts = plan.segments.reduce((n, s) => n + (s.inserts?.length ?? 0), 0);
  log(`${rel(p.kdenlive)}: ${plan.segments.length} pieces, ${zooms} emphasis zooms, ${inserts} inserts, ${clock((cut.length / summary.fps) * 1000)}`);
}

async function open() {
  if (!existsSync(p.kdenlive)) throw new Error(`No ${rel(p.kdenlive)} yet: npm run short -- kdenlive ${name}`);
  const flatpak = spawnSync("flatpak", ["info", "org.kde.kdenlive"], { stdio: "ignore" }).status === 0;
  const [c, ...args] = flatpak ? ["flatpak", "run", "org.kde.kdenlive"] : ["kdenlive"];
  const app = spawn(c, [...args, p.kdenlive], { detached: true, stdio: "ignore" });
  app.on("error", () => log(`Couldn't start Kdenlive: open ${rel(p.kdenlive)} in it yourself`));
  app.unref();
  log(`Kdenlive: ${rel(p.kdenlive)}`);
}

// --- captions (phase 3) ----------------------------------------------------------------

/** The voice's pieces in the cut: what's transcribed for captions. */
function voicePieces(cut: Cut) {
  return cut.audio.filter((a) => a.resource === p.voice && a.speed === 1).map((a) => ({ atF: a.atF, durF: a.durF, fromF: a.fromF }));
}

/** Which cut of the voice captions are for: they're remade when it changes. */
function cutKey(cut: Cut) {
  return createHash("sha1").update(JSON.stringify([cut.fps, voicePieces(cut)])).digest("hex").slice(0, 12);
}

async function cutWords(cut: Cut): Promise<Word[]> {
  const key = cutKey(cut);
  const cache = path.join(p.tmp, `captions-${key}.json`);
  if (existsSync(cache)) return readJson<Word[]>(cache);
  const pieces = voicePieces(cut);
  if (!pieces.length) throw new Error(`No pieces of ${rel(p.voice)} on the audio tracks of ${rel(p.kdenlive)}: nothing to caption`);
  // The voice as the cut plays it: its pieces at their places, silence between.
  const { rate, samples } = await readWav(p.voice);
  const at = (f: number) => Math.round((f / cut.fps) * rate);
  const total = at(cut.lengthF);
  const out = new Int16Array(total);
  for (const a of pieces) out.set(samples.subarray(at(a.fromF), at(a.fromF) + Math.min(at(a.durF), total - at(a.atF))), at(a.atF));
  const wav = path.join(p.tmp, "cut-voice.wav");
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + total * 2, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(total * 2, 40);
  await writeFile(wav, Buffer.concat([header, Buffer.from(out.buffer)]));
  const small = path.join(p.tmp, "cut-voice.16k.wav");
  await toWhisperWav(wav, small);
  await ensureWhisper();
  log(`captions: transcribing the cut (${clock((cut.lengthF / cut.fps) * 1000)}, about $${(((cut.lengthF / cut.fps) / 60) * 0.006).toFixed(3)})`);
  const { words } = await whisperWords(small, { lang: (await loadSettings()).language ?? "fi" });
  await writeFile(cache, JSON.stringify(words));
  return words;
}

async function captions() {
  if (!existsSync(p.kdenlive)) throw new Error(`No ${rel(p.kdenlive)}: the cut comes first`);
  await mkdir(p.tmp, { recursive: true });
  const cut = await readCut(p.kdenlive);
  const key = cutKey(cut);
  if (existsSync(p.captions)) {
    const old = await readFile(p.captions, "utf8");
    if (cutKeyOf(old) === key && !rest.includes("--force")) {
      log(`${rel(p.captions)} is for this cut already (--force makes it again from the transcript)`);
      return;
    }
    const backup = path.join(p.tmp, `captions.${cutKeyOf(old) ?? "old"}.txt`);
    await copyFile(p.captions, backup);
    log(`the captions before: ${rel(backup)}${cutKeyOf(old) === key ? "" : " (they were for an earlier cut)"}`);
  }
  const words = applyReplacements(await cutWords(cut), (await loadSettings()).replace ?? {});
  await writeFile(p.captions, writeCaptions(words, key));
  log(`${rel(p.captions)}: ${words.length} words`);
}

// --- render ----------------------------------------------------------------------------

async function render() {
  if (!existsSync(p.kdenlive)) throw new Error(`No ${rel(p.kdenlive)}: the cut comes first`);
  if (!existsSync(p.captions)) throw new Error(`No ${rel(p.captions)}: npm run short -- captions ${name}`);
  const cut = await readCut(p.kdenlive);
  for (const w of cut.warnings) log(`warning: ${w}`);
  if (cut.width !== W || cut.height !== H) log(`warning: the Kdenlive project is ${cut.width}×${cut.height}; the short is drawn ${W}×${H}`);
  const txt = await readFile(p.captions, "utf8");
  if (cutKeyOf(txt) !== cutKey(cut)) throw new Error(`${rel(p.captions)} is for an earlier cut (the voice was cut differently since): npm run short -- captions ${name} (the old one is kept in tmp/)`);
  const settings = await loadSettings();
  const lines = readCaptions(txt, await cutWords(cut));

  // Everything Remotion shows, in its public folder: hard links (a symlink doesn't survive its bundling).
  const pub = path.join(p.tmp, "public");
  await rm(pub, { recursive: true, force: true });
  await mkdir(pub, { recursive: true });
  const publish = async (from: string, as: string) => {
    await link(from, path.join(pub, as)).catch(() => copyFile(from, path.join(pub, as)));
    return as;
  };
  await run("cp", ["-r", "assets/brand", pub]);
  const published = new Map<string, string>();
  const pub1 = async (file: string) => {
    if (!published.has(file)) {
      if (!existsSync(file)) throw new Error(`${file}, used in ${rel(p.kdenlive)}, isn't there`);
      published.set(file, await publish(file, `s${published.size}${path.extname(file)}`));
    }
    return published.get(file)!;
  };

  const sources: ShortManifest["sources"] = [];
  const sourceIndex = new Map<string, number>();
  const tracks: ShortManifest["tracks"] = [];
  const fit = [{ f: 0, type: "", rect: [0, 0, W, H, 1] as [number, number, number, number, number] }];
  for (const t of cut.video) {
    const clips: ShortManifest["tracks"][number]["clips"] = [];
    for (const c of t.clips) {
      if (!c.resource || !existsSync(c.resource) || !/avformat|chain|qimage|timewarp|pixbuf|producer/.test(c.service || "avformat")) continue;
      if (!sourceIndex.has(c.resource)) {
        const image = IMAGE.test(c.resource);
        const pr = probe(c.resource);
        sourceIndex.set(c.resource, sources.length);
        sources.push({ src: await pub1(c.resource), width: pr.width, height: pr.height, ...(image ? { image } : {}) });
      }
      clips.push({ source: sourceIndex.get(c.resource)!, atF: c.atF, durF: c.durF, fromF: c.fromF, speed: c.speed, keys: c.keys ?? fit, blur: c.blur, brightness: c.brightness });
    }
    tracks.push({ clips, ...(t.keys ? { keys: t.keys } : {}) });
  }

  const audio: ShortManifest["audio"] = [];
  const { prop } = await import("./lib/kdenlive-xml.ts");
  for (const a of cut.audio) {
    if (!a.resource || !existsSync(a.resource) || a.speed !== 1) continue;
    let fadeInF = 1, fadeOutF = 1, gain = 1;
    for (const f of a.filters) {
      if (prop(f, "disable") === "1") continue;
      const id = prop(f, "kdenlive_id") ?? "";
      const len = cut.frames(f.attrs.out) - cut.frames(f.attrs.in) + 1;
      if (id === "fadein" || id === "fade_from_black") fadeInF = Math.max(fadeInF, len);
      if (id === "fadeout" || id === "fade_to_black") fadeOutF = Math.max(fadeOutF, len);
      // Kdenlive's Volume (dB), at its first keyframe.
      if (id === "volume") gain *= 10 ** (parseFloat((prop(f, "level") ?? "0").split(";")[0].split("=").at(-1)!) / 20);
    }
    audio.push({ src: await pub1(a.resource), atF: a.atF, durF: a.durF, fromF: a.fromF, fadeInF, fadeOutF, gain });
  }

  let music: string | undefined;
  if (settings.music && existsSync(settings.music)) music = await publish(path.resolve(settings.music), `music${path.extname(settings.music)}`);
  else if (settings.music) log(`no music: ${settings.music} not found`);

  const manifest: ShortManifest = {
    fps: cut.fps, width: W, height: H, durationFrames: cut.lengthF, sources, tracks, audio, lines, music,
    musicVolume: settings.musicVolume ?? 0.08, grade: settings.grade ?? 1,
  };
  const props = path.join(p.tmp, "manifest.json");
  await writeFile(props, JSON.stringify(manifest));
  const total = cut.lengthF;
  const sampleAt = rest.indexOf("--sample");
  let frames: string[] = [];
  let file = p.out;
  const fps = cut.fps;
  if (sampleAt >= 0) {
    const from = Math.round(seconds(rest[sampleAt + 1] ?? 0) * fps);
    const to = Math.min(total, Math.round(seconds(rest[sampleAt + 2] ?? total / fps) * fps));
    frames = [`--frames=${Math.min(from, total - 1)}-${Math.max(from, to - 1)}`];
    file = p.sample;
    log(`rendering ${clock((from / fps) * 1000)}–${clock((to / fps) * 1000)} of ${clock((total / fps) * 1000)}`);
  } else log(`rendering ${clock((total / fps) * 1000)}: ${tracks.reduce((n, t) => n + t.clips.length, 0)} clips, ${lines.length} caption lines, grade ${manifest.grade}${music ? ", music" : ""}`);
  await run("npx", ["remotion", "render", "src/remotion/index.ts", "Short", file, `--props=${props}`, `--public-dir=${pub}`, ...frames,
    // 4K frames are big: few tabs, a bounded frame cache.
    "--concurrency=3", "--offthreadvideo-cache-size-in-bytes=1500000000", "--timeout=180000", "--log=error"]);
  log(rel(file));
}

// --- review ----------------------------------------------------------------------------

async function review() {
  const file = rest.includes("--sample") ? p.sample : p.out;
  if (!existsSync(file)) throw new Error(`No ${rel(file)}: render it first`);
  const manifest = await readJson<ShortManifest>(path.join(p.tmp, "manifest.json"));
  const fps = manifest.fps;
  const framesDir = path.join(p.review, "frames");
  await rm(p.review, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });
  const report: string[] = [`# Review of ${rel(file)}`, "", "Times are of the video (the cut: it starts at 0).", ""];

  if (process.env.OPENAI_API_KEY) {
    const wav = path.join(p.tmp, "out.16k.wav");
    await toWhisperWav(file, wav);
    log("review: transcribing the video");
    const { words: heard } = await whisperWords(wav, { lang: (await loadSettings()).language ?? "fi" });
    await writeFile(path.join(p.review, "heard.json"), JSON.stringify(heard));
    const captioned = manifest.lines.flatMap((l) => l.words);
    const cuts = manifest.tracks.flatMap((t) => t.clips.map((c) => (c.atF / fps) * 1000)).filter((ms) => ms > 0);
    report.push("## Heard against the captions", "", ...diffWords(captioned, heard, cuts), "");
    report.push("## Said twice (in what's heard)", "", ...repeats(heard), "");
  } else report.push("## Heard against the captions", "", "Skipped: no OPENAI_API_KEY in .env to transcribe the video with.", "");

  const lengthS = manifest.durationFrames / fps;
  const loud = await ffReport(["-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const integrated = [...loud.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)?.[1];
  const peak = [...loud.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].at(-1)?.[1];
  const quiet = await ffReport(["-i", file, "-af", "silencedetect=noise=-45dB:d=0.8", "-f", "null", "-"]);
  const silences = [...quiet.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_duration: ([\d.]+)/g)].map((m) => `- ${clock(Number(m[1]) * 1000)}, ${Number(m[2]).toFixed(1)} s`);
  report.push("## Sound", "", `- length ${clock(lengthS * 1000)}`, `- loudness ${integrated ?? "?"} LUFS (aim -14 to -16), true peak ${peak ?? "?"} dBFS (should be under -1)`,
    silences.length ? `- silences over 0.8 s:\n${silences.join("\n")}` : "- no silences over 0.8 s", "");
  const black = await ffReport(["-i", file, "-an", "-vf", "blackdetect=d=0.03:pix_th=0.05", "-f", "null", "-"]);
  const blacks = [...black.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => `- ${clock(Number(m[1]) * 1000)}–${clock(Number(m[2]) * 1000)}`);
  report.push("## Black picture", "", ...(blacks.length ? blacks : ["- none"]), "");

  // Frames: each clip just after it starts, each zoom once settled, and the middle of long clips.
  const shots: { ms: number; what: string }[] = [];
  manifest.tracks.forEach((t, ti) =>
    t.clips.forEach((c) => {
      const at = (c.atF / fps) * 1000;
      shots.push({ ms: at + 300, what: `${ti === 0 ? "camera" : `track ${ti + 1}`} clip at ${clock(at)}, just after its start` });
      c.keys.forEach((k, i) => {
        const prev = c.keys[i - 1];
        if (prev && k.rect[2] > prev.rect[2] * 1.02 && k.f < c.durF) shots.push({ ms: at + (k.f / fps) * 1000 + 100, what: `zoom in at ${clock(at + (k.f / fps) * 1000)}, settled` });
      });
      if (c.durF / fps > 6) shots.push({ ms: at + (c.durF / fps / 2) * 1000, what: `middle of the clip at ${clock(at)}` });
    }),
  );
  const seen = new Set<number>();
  const list = shots.filter((s) => s.ms < lengthS * 1000).sort((a, b) => a.ms - b.ms).filter((s) => !seen.has(Math.round(s.ms / 200)) && seen.add(Math.round(s.ms / 200)));
  report.push("## Frames", "", `In ${rel(p.review)}/sheet-*.jpg, eight a sheet (four a row, left to right), in this order; one each in frames/NNN.jpg:`, "");
  for (const [i, s] of list.entries()) {
    const n = String(i + 1).padStart(3, "0");
    await ff(["-v", "error", "-y", "-ss", String(s.ms / 1000), "-i", file, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "3", path.join(framesDir, `${n}.jpg`)]);
    report.push(`${i + 1}. ${clock(s.ms)}  ${s.what}`);
  }
  for (let start = 0, k = 1; start < list.length; start += 8, k++) {
    await ff(["-v", "error", "-y", "-framerate", "1", "-start_number", String(start + 1), "-i", path.join(framesDir, "%03d.jpg"),
      "-frames:v", "1", "-vf", "tile=4x2:padding=6:color=black", "-q:v", "3", path.join(p.review, `sheet-${String(k).padStart(2, "0")}.jpg`)]);
  }
  const reportFile = path.join(p.review, "report.md");
  await writeFile(reportFile, `${report.join("\n")}\n`);
  log(rel(reportFile));
}

/** Runs of words captioned but not heard, or heard but not captioned, each marked when it's at a cut. */
function diffWords(planned: Word[], heard: Word[], cuts: number[]): string[] {
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const a = planned.map((w) => norm(w.text));
  const b = heard.map((w) => norm(w.text));
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: string[] = [];
  let i = 0, j = 0;
  let miss: Word[] = [], extra: Word[] = [];
  const flush = () => {
    if (miss.length + extra.length) {
      const all = [...miss, ...extra];
      const from = Math.min(...all.map((w) => w.startMs));
      const to = Math.max(...all.map((w) => w.endMs));
      const atCut = cuts.some((c) => c >= from - 300 && c <= to + 300);
      const tag = atCut ? "AT A CUT: " : miss.length + extra.length <= 2 ? "(likely Whisper) " : "";
      out.push(`- ${clock(from)}: ${tag}captioned "${miss.map((w) => w.text).join(" ")}", heard "${extra.map((w) => w.text).join(" ")}"`);
    }
    miss = [];
    extra = [];
  };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      flush();
      i++, j++;
    } else if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) miss.push(planned[i++]);
    else extra.push(heard[j++]);
  }
  flush();
  const same = dp[0][0];
  return [`${same} of ${n} captioned words heard in order (${n ? Math.round((same / n) * 100) : 100}%).`, "", ...(out.length ? out.slice(0, 60) : ["No differences."])];
}

/** Phrases heard twice running: a retake left in. */
function repeats(heard: Word[]): string[] {
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const phrases: Word[][] = [];
  let cur: Word[] = [];
  for (const w of heard) {
    cur.push(w);
    if (/[.,!?;:]$/.test(w.text)) phrases.push(cur), (cur = []);
  }
  if (cur.length) phrases.push(cur);
  const out: string[] = [];
  for (let i = 0; i + 1 < phrases.length; i++) {
    const x = phrases[i].map((w) => norm(w.text));
    for (const q of phrases.slice(i + 1, i + 3)) {
      const y = q.map((w) => norm(w.text));
      if (x.length < 3) break;
      const common = x.filter((t) => y.includes(t)).length;
      if (common / Math.max(x.length, y.length) >= 0.7) {
        out.push(`- ${clock(phrases[i][0].startMs)}: "${phrases[i].map((w) => w.text).join(" ")}" then "${q.map((w) => w.text).join(" ")}"`);
        break;
      }
    }
  }
  return out.length ? out : ["- none"];
}

// ---------------------------------------------------------------------------------------

async function loadSettings(): Promise<Settings> {
  return existsSync(p.settings) ? ((await readYaml<Settings>(p.settings)) ?? {}) : {};
}

async function loadPlan() {
  for (const f of [p.summary, p.transcript]) if (!existsSync(f)) throw new Error(`No ${rel(f)}: npm run short -- analyze ${name}`);
  if (!existsSync(p.plan)) throw new Error(`No ${rel(p.plan)}: the planner writes it`);
  return { summary: await readJson<Summary>(p.summary), plan: await readYaml<Plan>(p.plan), words: await readJson<Word[]>(p.transcript) };
}
