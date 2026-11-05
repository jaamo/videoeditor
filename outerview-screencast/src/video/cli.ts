// The work the video agents hand off: exact, slow, or paid for, so done by code, once.
//   npm run video -- init <name>                  folders and project.yaml
//   npm run video -- analyze <name> [--force]     voice, transcript, sync, screen events, contact sheets
//   npm run video -- frame <name> <screen|face|out> <seconds> [x,y,w,h]   one frame to look at
//   npm run video -- titles <name>                stills of the opening title and the end card
//   npm run video -- check <name>                 the plan's problems, before rendering
//   npm run video -- render <name> [--sample <from> <to>]   out.mp4 (or sample.mp4, seconds of the video)
//   npm run video -- review <name>                checks of out.mp4: heard against planned, sound, frames
//   npm run video -- comments <name> [--sample] [--port 4321]   watch it in the browser, comment on moments
// Times are seconds of the main recording (see analysis/summary.json), except where said.
import { existsSync } from "node:fs";
import { copyFile, link, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { editDurationMs, openingMs } from "../remotion/Edit.tsx";
import { introDurationMs } from "../remotion/titles/Intro.tsx";
import { END_MS } from "../remotion/titles/End.tsx";
import type { EditManifest, Word } from "../types.ts";
import { roughCut } from "../screencast/rough-cut.ts";
import { run } from "../screencast/run.ts";
import { ensureWhisper, toWhisperWav, whisperWords } from "../screencast/whisper.ts";
import { contactSheets, ff, ffReport, fingerprint, levels, probe, still } from "./media.ts";
import {
  checkPlan, clock, FPS, footageOf, homeSegments, LOUD_AT_CUT_DB, manifestOf, paths, readJson, readYaml, seconds, transcriptText,
  type Paths, type Placed, type Plan, type Settings, type Summary, type Titles,
} from "./project.ts";
import { serveComments } from "./comments.ts";
import { screenEvents } from "./screen.ts";
import { offsetOf } from "./sync.ts";
import { isIsolated, makeVoice, refusedFile } from "./voice.ts";

const SPELLING = { Audiview: "Outerview", Audaview: "Outerview", Audioview: "Outerview", "outer view": "Outerview", Maija: "Maya", Maijan: "Mayan", Maijalle: "Mayalle" };
const DEFAULT_MUSIC = "assets/music/She No Dull Beat - Nana Kwabena.mp3";

const [cmd, name, ...rest] = process.argv.slice(2);
if (!cmd || !name || !/^[\p{Ll}\p{N}][\p{Ll}\p{N}-]*$/u.test(name)) {
  console.error("Usage: npm run video -- <init|analyze|frame|titles|check|render|review> <name>  (name: lowercase letters, digits, dashes)");
  process.exit(2);
}
const p = paths(name);
const log = (s: string) => console.log(s);
const rel = (f: string) => path.relative(process.cwd(), f);
const s1 = (ms: number) => Math.round(ms / 100) / 10;

const commands: Record<string, () => Promise<void>> = { init, analyze, frame, level, titles, check, render, review, comments };
if (!commands[cmd]) throw new Error(`Unknown command ${cmd}`);
if (cmd !== "init" && !existsSync(p.dir)) throw new Error(`No project ${rel(p.dir)}: npm run video -- init ${name}`);
await commands[cmd]();

// --- init ------------------------------------------------------------------------------

async function init() {
  await mkdir(p.footage, { recursive: true });
  if (!existsSync(p.settings)) {
    const settings: Settings = { language: "fi", music: DEFAULT_MUSIC, musicVolume: 0.1, replace: SPELLING };
    await writeFile(p.settings, `# ${name}: settings for the video agents (see /make-video)\n${YAML.stringify(settings)}`);
  }
  log(`${rel(p.dir)}/: put the recordings in ${rel(p.footage)}/ (a vertical face video and/or a screen recording)`);
}

// --- analyze ---------------------------------------------------------------------------

async function analyze() {
  const force = rest.includes("--force");
  const settings = await loadSettings();
  const { face, screen } = footageOf(p, probe);
  if (!face && !screen) throw new Error(`No recordings in ${rel(p.footage)}/`);
  const inputs = Object.fromEntries([face, screen].filter((x) => x).map((x) => [path.basename(x!.file), fingerprint(x!.file)]));
  const old = existsSync(p.summary) ? await readJson<Summary>(p.summary) : undefined;
  if (force || (old && JSON.stringify(old.inputs) !== JSON.stringify(inputs))) {
    log(force ? "analysis: starting over (--force)" : "analysis: the footage changed, starting over");
    await rm(p.analysis, { recursive: true, force: true });
  }
  for (const d of [p.analysis, p.sheets, p.frames, p.tmp]) await mkdir(d, { recursive: true });

  // The main recording is the one with the voice; the other is placed in its time by sound.
  const mainKind = face?.hasAudio ? "face" : screen?.hasAudio ? "screen" : undefined;
  if (!mainKind) throw new Error("Neither recording has sound: there's no voice to cut by");
  const main = mainKind === "face" ? face! : screen!;
  const other = mainKind === "face" ? screen : face;
  let summary: Summary;
  if (old && !force && JSON.stringify(old.inputs) === JSON.stringify(inputs)) summary = old;
  else {
    const placedMain: Placed = { ...main, startMs: 0, synced: "main" };
    let placedOther: Placed | undefined;
    if (other) {
      if (other.hasAudio) {
        log(`sync: matching the sound of ${path.basename(other.file)} to ${path.basename(main.file)}`);
        const { startMs, confidence } = await offsetOf(main.file, other.file);
        placedOther = { ...other, startMs, synced: "sound", syncConfidence: Math.round(confidence * 10) / 10 };
        log(`sync: ${path.basename(other.file)} starts at ${s1(startMs)} s of the main recording (confidence ${confidence.toFixed(1)}${confidence < 5 ? ": LOW, check it" : ""})`);
      } else {
        placedOther = { ...other, startMs: 0, synced: "assumed" };
        log(`sync: ${path.basename(other.file)} has no sound: assumed to start with the main recording`);
      }
    }
    summary = {
      main: mainKind,
      durationMs: main.durationMs,
      face: mainKind === "face" ? placedMain : placedOther,
      screen: mainKind === "screen" ? placedMain : placedOther,
      inputs,
    };
    await writeFile(p.summary, JSON.stringify(summary, null, 2));
  }

  // Without ElevenLabs' take (there was no key then), it's tried again; not after a refusal.
  if (!existsSync(p.voice) || (process.env.ELEVENLABS_API_KEY && !isIsolated(p.voice) && !existsSync(refusedFile(p.voice)))) await makeVoice(main.file, p.voice, log);
  else log("voice: done before");

  // Where the clean voice is quiet (first: it also shows where Whisper missed speech): exact cut points where Whisper's word times are stretched.
  const silencesFile = path.join(p.analysis, "silences.json");
  if (!existsSync(silencesFile)) {
    const quiet = await ffReport(["-i", p.voice, "-af", "silencedetect=noise=-40dB:d=0.12", "-f", "null", "-"]);
    const list = [...quiet.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)].map((m) => [Math.round(Number(m[1]) * 100) / 100, Math.round(Number(m[2]) * 100) / 100]);
    await writeFile(silencesFile, JSON.stringify({ about: "Stretches of 0.12 s or more where the clean voice is under -40 dB, [from, to] in seconds of the main recording. Cut inside these.", silences: list }));
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
    // A transcript from before gaps were filled is Whisper's own: kept as that.
    if (existsSync(whisperFile)) raw = await readJson<Word[]>(whisperFile);
    else if (existsSync(p.transcript)) raw = await readJson<Word[]>(p.transcript);
    else {
      log(`transcript: OpenAI Whisper (${(summary.durationMs / 60000).toFixed(1)} min, about $${((summary.durationMs / 60000) * 0.006).toFixed(2)})`);
      ({ words: raw } = await whisperWords(small, { lang: settings.language ?? "fi" }));
    }
    await writeFile(whisperFile, JSON.stringify(raw));
    const silences = (await readJson<{ silences: [number, number][] }>(silencesFile)).silences;
    const gaps = await fillGaps(raw, silences, summary.durationMs, small, settings.language ?? "fi");
    words = gaps.words;
    await writeFile(path.join(p.analysis, "transcript-gaps.json"), JSON.stringify({
      about: "Speech Whisper left out of transcript.json the first time, transcribed again on its own and added. Seconds of the main recording. Check these: Whisper may also invent words over noise.",
      added: gaps.added,
    }, null, 1));
    await writeFile(p.transcript, JSON.stringify(words));
  }
  await writeFile(p.transcriptText, transcriptText(words));

  if (!existsSync(p.cuts)) {
    const { keep, removed } = await roughCut(p.voice, words);
    await writeFile(p.cuts, JSON.stringify({
      about: "A first guess at what to keep, in seconds of the main recording: speech without pauses over 1 s, retakes and lone fillers. A starting point, not the plan.",
      keep: keep.map((r) => [s1(r.fromMs), s1(r.toMs)]),
      removed: removed.map((r) => ({ from: s1(r.fromMs), to: s1(r.toMs), why: r.why })),
    }, null, 1));
  }

  if (summary.screen && !existsSync(p.screenEvents)) {
    log("screen: looking for clicks, page changes and activity");
    const sc = summary.screen;
    const ev = await screenEvents(sc.file, sc);
    const t = (ms: number) => s1(ms + sc.startMs);
    await writeFile(p.screenEvents, JSON.stringify({
      about: "Seconds of the main recording; x, y and boxes [x, y, width, height] in the screen recording's pixels. Clicks are the rings npm run clicks draws (none if it wasn't running).",
      size: [sc.width, sc.height],
      clicks: ev.clicks.map((c) => ({ t: t(c.ms), x: c.x, y: c.y })),
      changes: ev.changes.map((c) => ({ t: t(c.ms), share: c.share })),
      activity: ev.activity.map((a) => ({ from: t(a.fromMs), to: t(a.toMs), box: a.box })),
    }, null, 1));
  }

  const sheets = await readdir(p.sheets);
  const index: string[] = existsSync(path.join(p.sheets, "index.txt")) ? (await readFile(path.join(p.sheets, "index.txt"), "utf8")).split("\n").slice(1).filter(Boolean) : [];
  for (const [kind, r, every] of [["screen", summary.screen, 5], ["face", summary.face, 10]] as const) {
    if (!r || sheets.some((f) => f.startsWith(`${kind}-`))) continue;
    log(`sheets: ${kind}, a frame every ${every} s`);
    const cols = kind === "face" ? 8 : 4;
    const made = await contactSheets(r.file, r.durationMs, path.join(p.sheets, kind), every, { offsetMs: r.startMs, tileWidth: kind === "face" ? 240 : 480, cols, rows: kind === "face" ? 2 : 4 });
    index.push(...made.map((m) => `${path.basename(m.file)}: ${cols} a row, left to right, at ${m.times.join(", ")} s`));
  }
  if (index.length) await writeFile(path.join(p.sheets, "index.txt"), `Seconds of the main recording.\n${index.join("\n")}\n`);

  log(`\n${rel(p.analysis)}/`);
  for (const f of (await readdir(p.analysis)).sort()) log(`  ${f}`);
  log(`main recording: ${mainKind} (${clock(summary.durationMs)})`);
}

/** The screen recording's own sound, mastered but not isolated (it keeps the app's voice), made once. */
async function screenSound(summary: Summary): Promise<string> {
  const out = path.join(p.analysis, "screen-sound.wav");
  if (!existsSync(out)) await makeVoice(summary.screen!.file, out, (s) => log(s.replace(/^voice:/, "screen sound:")), { isolate: false });
  return out;
}

/**
 * Whisper sometimes leaves out a stretch of speech (after a long silence, under other sound).
 * Where the voice is heard (between `silences`) but no word is, it's transcribed again on
 * its own and the words put in.
 */
async function fillGaps(words: Word[], silences: [number, number][], durationMs: number, wav: string, lang: string) {
  // Sound: what's between the silences, joined over short breaths.
  const sound: [number, number][] = [];
  let at = 0;
  for (const [a, b] of [...silences.map(([x, y]) => [x * 1000, y * 1000] as const), [durationMs, durationMs] as const]) {
    if (a - at > 0) {
      if (sound.length && at - sound.at(-1)![1] < 500) sound.at(-1)![1] = a;
      else sound.push([at, a]);
    }
    at = b;
  }
  // In steps of STEP ms: sound with no word on it. Runs of 0.8 s or more are missing speech.
  const STEP = 250;
  const hasWord = (t: number) => words.some((w) => w.startMs < t + STEP && Math.max(w.endMs, w.startMs + 200) > t);
  const missing: [number, number][] = [];
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
  function push(r: [number, number]) {
    if (missing.length && r[0] - missing.at(-1)![1] < 1000) missing.at(-1)![1] = r[1];
    else missing.push(r);
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
        // Inside the gap, and not a word that's there already.
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
  const summary = await readJson<Summary>(p.summary);
  const ms = Math.round(seconds(at) * 1000);
  const b = box ? (box.split(/[ ,]+/).map(Number) as [number, number, number, number]) : undefined;
  let file: string;
  let localMs = ms;
  let dir = p.frames;
  if (what === "out" || what === "sample") {
    file = what === "out" ? p.out : p.sample;
    dir = path.join(p.review, "frames");
  } else {
    const r = what === "face" ? summary.face : summary.screen;
    if (!r) throw new Error(`No ${what} recording`);
    file = r.file;
    localMs = ms - r.startMs;
  }
  await mkdir(dir, { recursive: true });
  const out = path.join(dir, `${what}-${(ms / 1000).toFixed(1)}${b ? "-box" : ""}.jpg`);
  // Full size, so a point read off it is in the recording's own pixels.
  await still(file, localMs, out, { box: b });
  log(rel(out));
}

// --- level -----------------------------------------------------------------------------

/** The clean voice's loudness every 50 ms between two times: where a word really starts and ends. */
async function level() {
  const [fromS, toS] = rest;
  if (fromS === undefined || toS === undefined) throw new Error("Usage: npm run video -- level <name> <from> <to>  (seconds of the main recording)");
  const at = await levels(p.voice);
  const from = Math.round(seconds(fromS) * 1000);
  const to = Math.min(from + 30_000, Math.round(seconds(toS) * 1000));
  log(`dBFS of ${rel(p.voice)} (speech about -20, quiet under -45, cuts are heard over ${LOUD_AT_CUT_DB}):`);
  for (let ms = from; ms <= to; ms += 50) {
    const db = at(ms);
    log(`${(ms / 1000).toFixed(2).padStart(7)}  ${String(Math.round(db)).padStart(4)}  ${"█".repeat(Math.max(0, Math.round((db + 70) / 2.5)))}`);
  }
}

// --- comments --------------------------------------------------------------------------

async function comments() {
  const at = rest.indexOf("--port");
  await serveComments(p, { sample: rest.includes("--sample"), port: at >= 0 ? Number(rest[at + 1]) : 4321 });
}

// --- titles ----------------------------------------------------------------------------

async function titles() {
  const t = await readYaml<Titles>(p.titles);
  if (!t?.title) throw new Error(`${rel(p.titles)} needs a title`);
  const introMs = introDurationMs({ title: t.title });
  const shots = [
    { comp: "Intro", props: { title: t.title, subtitle: t.subtitle }, ms: introMs - 300, out: "titles-intro.png" },
    { comp: "End", props: { line: t.endLine }, ms: 1800, out: "titles-end.png" },
  ];
  for (const s of shots) {
    const out = path.join(p.tmp, s.out);
    await mkdir(p.tmp, { recursive: true });
    await run("npx", ["remotion", "still", "src/remotion/index.ts", s.comp, out, `--props=${JSON.stringify(s.props)}`, `--frame=${Math.round((s.ms / 1000) * FPS)}`, "--public-dir=assets/titles", "--log=error"]);
    log(rel(out));
  }
  log(`intro ${s1(introMs)} s (${t.title.split(" ").length} words), end card ${s1(END_MS)} s`);
}

// --- check -----------------------------------------------------------------------------

async function check() {
  const { summary, plan, words } = await loadForRender();
  const problems = checkPlan(plan, summary, words, await levels(p.voice));
  for (const x of problems) log(`${x.level === "error" ? "ERROR  " : "warning"} ${x.where}: ${x.what}`);
  if (!problems.some((x) => x.level === "error")) {
    const m = manifestOf({ plan, summary, titles: { title: "x" }, settings: await loadSettings(), words, published: { voice: "" } });
    log(`\n${plan.segments.length} segments, ${m.zooms.length} zooms, cut ${clock(m.cutMs)}`);
    const home = homeSegments(words, plan.segments.map((s) => [seconds(s.from) * 1000, seconds(s.to) * 1000] as const));
    for (const [i, s] of plan.segments.entries()) {
      const text = s.text?.trim() || words.filter((_, k) => home[k] === i).map((w) => w.text).join(" ");
      log(`  ${i + 1}. ${s.layout.padEnd(6)} ${clock(m.segments[i].atMs)} in the cut  "${text.length > 90 ? `${text.slice(0, 87)}…` : text}"`);
    }
  }
  if (problems.some((x) => x.level === "error")) process.exit(1);
  log(problems.length ? "\nno errors (see the warnings)" : "\nno problems");
}

// --- render ----------------------------------------------------------------------------

async function render() {
  const { summary, plan, words } = await loadForRender();
  const errors = checkPlan(plan, summary, words, await levels(p.voice)).filter((x) => x.level === "error");
  if (errors.length) throw new Error(`The plan has errors: npm run video -- check ${name}\n${errors.map((e) => `  ${e.where}: ${e.what}`).join("\n")}`);
  const settings = await loadSettings();
  const t = existsSync(p.titles) ? await readYaml<Titles>(p.titles) : { title: name };

  // Everything Remotion shows, in its public folder: hard links (a symlink doesn't survive its bundling).
  const pub = path.join(p.tmp, "public");
  await mkdir(pub, { recursive: true });
  const publish = async (from: string, as: string) => {
    const to = path.join(pub, as);
    await rm(to, { force: true });
    await link(from, to).catch(() => copyFile(from, to));
    return as;
  };
  const published = {
    face: summary.face ? await publish(summary.face.file, `face${path.extname(summary.face.file)}`) : undefined,
    screen: summary.screen ? await publish(summary.screen.file, `screen${path.extname(summary.screen.file)}`) : undefined,
    voice: await publish(p.voice, "voice.wav"),
    screenSound: plan.segments.some((s) => s.sound === "screen") ? await publish(await screenSound(summary), "screen-sound.wav") : undefined,
    music: settings.music && existsSync(settings.music) ? await publish(path.resolve(settings.music), `music${path.extname(settings.music)}`) : undefined,
  };
  if (settings.music && !published.music) log(`no music: ${settings.music} not found`);
  await run("cp", ["-r", "assets/brand", pub]);
  await run("sh", ["-c", `cp -r assets/titles/* "${pub}"`]);

  const manifest = manifestOf({ plan, summary, titles: t, settings, words, published });
  const props = path.join(p.tmp, "manifest.json");
  await writeFile(props, JSON.stringify(manifest));
  const total = Math.round((editDurationMs(manifest) / 1000) * FPS);
  const sampleAt = rest.indexOf("--sample");
  let frames: string[] = [];
  let file = p.out;
  if (sampleAt >= 0) {
    const from = Math.round(seconds(rest[sampleAt + 1] ?? 0) * FPS);
    const to = Math.min(total, Math.round(seconds(rest[sampleAt + 2] ?? total / FPS) * FPS));
    frames = [`--frames=${Math.min(from, total - 1)}-${Math.max(from, to - 1)}`];
    file = p.sample;
    log(`rendering ${clock((from / FPS) * 1000)}–${clock((to / FPS) * 1000)} of ${clock((total / FPS) * 1000)}`);
  } else log(`rendering ${clock((total / FPS) * 1000)}: ${manifest.opening === false ? "" : "opening title, "}${manifest.segments.length} segments, ${manifest.zooms.length} zooms, ${manifest.words.length} words of captions, end`);
  await run("npx", ["remotion", "render", "src/remotion/index.ts", "Edit", file, `--props=${props}`, `--public-dir=${pub}`, ...frames,
    // Many browser tabs on a long render run out of memory: fewer tabs, a bounded frame cache.
    "--concurrency=4", "--offthreadvideo-cache-size-in-bytes=1000000000", "--timeout=120000", "--log=error"]);
  log(rel(file));
}

// --- review ----------------------------------------------------------------------------

async function review() {
  const file = rest.includes("--sample") ? p.sample : p.out;
  if (!existsSync(file)) throw new Error(`No ${rel(file)}: render it first`);
  const manifest = await readJson<EditManifest>(path.join(p.tmp, "manifest.json"));
  const introMs = openingMs(manifest);
  const framesDir = path.join(p.review, "frames");
  await rm(p.review, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });
  const report: string[] = [`# Review of ${rel(file)}`, "", `Times are of the video (${introMs ? `the opening title is ${clock(introMs)}; the cut starts there` : "no opening title: the cut starts at 0"}).`, ""];

  // Heard against planned.
  await ensureWhisper();
  const wav = path.join(p.tmp, "out.16k.wav");
  await toWhisperWav(file, wav);
  log("review: transcribing the video");
  const { words: heard } = await whisperWords(wav, { lang: (await loadSettings()).language ?? "fi" });
  await writeFile(path.join(p.review, "heard.json"), JSON.stringify(heard));
  const planned = manifest.words.map((w) => ({ ...w, startMs: w.startMs + introMs, endMs: w.endMs + introMs }));
  const cuts = manifest.segments.slice(1).map((s) => introMs + s.atMs);
  report.push("## Heard against planned", "", ...diffWords(planned, heard, cuts), "");

  report.push("## Said twice (in what's heard)", "", ...repeats(heard), "");

  // Sound.
  const loud = await ffReport(["-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const integrated = [...loud.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)?.[1];
  const peak = [...loud.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].at(-1)?.[1];
  const cutFrom = introMs / 1000;
  const cutTo = (introMs + manifest.cutMs) / 1000;
  const quiet = await ffReport(["-ss", String(cutFrom), "-to", String(cutTo), "-i", file, "-af", "silencedetect=noise=-45dB:d=1.2", "-f", "null", "-"]);
  const silences = [...quiet.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_duration: ([\d.]+)/g)].map((m) => `- ${clock((Number(m[1]) + cutFrom) * 1000)}, ${Number(m[2]).toFixed(1)} s`);
  report.push("## Sound", "", `- loudness ${integrated ?? "?"} LUFS (aim -16), true peak ${peak ?? "?"} dBFS (should be under -1)`, silences.length ? `- silences over 1.2 s in the cut:\n${silences.join("\n")}` : "- no silences over 1.2 s in the cut", "");

  const black = await ffReport(["-ss", String(cutFrom), "-to", String(cutTo), "-i", file, "-an", "-vf", "blackdetect=d=0.03:pix_th=0.05", "-f", "null", "-"]);
  const blacks = [...black.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => `- ${clock((Number(m[1]) + cutFrom) * 1000)}–${clock((Number(m[2]) + cutFrom) * 1000)}`);
  report.push("## Black picture in the cut", "", ...(blacks.length ? blacks : ["- none"]), "");

  // Frames to look at: each cut just after it, each layout change and zoom once settled, the cards.
  const shots: { ms: number; what: string }[] = introMs ? [{ ms: introMs - 300, what: "opening title" }] : [];
  manifest.segments.forEach((s, i) => {
    shots.push({ ms: introMs + s.atMs + 300, what: `segment ${i + 1} (${s.layout}) just after its cut` });
    if (i && s.layout !== manifest.segments[i - 1].layout) shots.push({ ms: introMs + s.atMs + 900, what: `segment ${i + 1}: layout now ${s.layout}` });
  });
  manifest.zooms.forEach((z, i) => shots.push({ ms: introMs + z.atMs + 1000, what: `zoom ${i + 1}, settled` }));
  shots.push({ ms: introMs + manifest.cutMs + 1800, what: "end card" });
  shots.sort((a, b) => a.ms - b.ms);
  report.push("## Frames", "", `In ${rel(p.review)}/sheet-*.jpg, nine a sheet (three a row, left to right), in this order; one each in frames/NNN.jpg:`, "");
  for (const [i, s] of shots.entries()) {
    const n = String(i + 1).padStart(3, "0");
    await ff(["-v", "error", "-y", "-ss", String(s.ms / 1000), "-i", file, "-frames:v", "1",
      "-vf", "scale=640:-2",
      "-q:v", "3", path.join(framesDir, `${n}.jpg`)]);
    report.push(`${i + 1}. ${clock(s.ms)}  ${s.what}`);
  }
  for (let start = 0, k = 1; start < shots.length; start += 9, k++) {
    await ff(["-v", "error", "-y", "-framerate", "1", "-start_number", String(start + 1), "-i", path.join(framesDir, "%03d.jpg"),
      "-frames:v", "1", "-vf", "tile=3x3:padding=6:color=black", "-q:v", "3", path.join(p.review, `sheet-${String(k).padStart(2, "0")}.jpg`)]);
  }
  const reportFile = path.join(p.review, "report.md");
  await writeFile(reportFile, `${report.join("\n")}\n`);
  log(rel(reportFile));
}

/**
 * Runs of words planned but not heard, or heard but not planned (word-level, by longest
 * common subsequence), each marked when it's at a cut (`cuts`: ms of the video).
 */
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
      // At a cut, a word heard differently is likely clipped; elsewhere a word or two is Whisper's spelling.
      const tag = atCut ? "AT A CUT: " : miss.length + extra.length <= 2 ? "(likely Whisper) " : "";
      out.push(`- ${clock(from)}: ${tag}planned "${miss.map((w) => w.text).join(" ")}", heard "${extra.map((w) => w.text).join(" ")}"`);
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
  return [`${same} of ${n} planned words heard in order (${n ? Math.round((same / n) * 100) : 100}%).`, "", ...(out.length ? out.slice(0, 60) : ["No differences."])];
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

async function loadForRender() {
  for (const f of [p.summary, p.transcript]) if (!existsSync(f)) throw new Error(`No ${rel(f)}: npm run video -- analyze ${name}`);
  if (!existsSync(p.plan)) throw new Error(`No ${rel(p.plan)}: the planner writes it`);
  return { summary: await readJson<Summary>(p.summary), plan: await readYaml<Plan>(p.plan), words: await readJson<Word[]>(p.transcript), p: p as Paths };
}
