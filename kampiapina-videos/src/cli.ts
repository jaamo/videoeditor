// The work the agents hand off: exact or slow, so done by code, once.
//   npm run video -- init <name> <source folder> [--project <Resolve project>]
//   npm run video -- sort <name> [file=aroll|broll|skip …]   the dropped files: what they look like, then their roles
//   npm run video -- analyze <name> [--force]   voice, silences, the transcript as text, a first guess, contact sheets
//   npm run video -- frame <name> <file> <seconds> [x,y,w,h]
//   npm run video -- level <name> <from> <to> [file]   the voice's loudness, to cut in the quiet
//   npm run video -- sync <name> [<b-roll file> …]   two cameras: the clock offset between them from the sound, and which b-roll clips have talk the A-roll doesn't
//   npm run video -- merge <name>               plan.part1.yaml … plan.partN.yaml (a long video planned in parts) into plan.yaml
//   npm run video -- check <name> [--plan <file>]   the plan's problems (--plan: another file than plan.yaml: a part of it, or a short's plan)
//   npm run video -- broll <name> [--max-len 10] [--gap 4] [--shift 240]   a b-roll pass on the timeline as it is (after mcp dump): the usable sections of analysis/broll-sections*.json placed on V2 by real time, as tmp/broll.json
//   npm run video -- build <name> [--force]     the plan as tmp/build.json, and the Resolve script to run
//   npm run video -- mcp <name> <ingest [--all]|build|dump|still|broll> [args…]   the Python to run through the Resolve MCP (--all: the b-roll transcribed too; broll: append tmp/broll.json on V2)
// Times are seconds of the A-roll file, except where they're of the cut.
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { roughCut } from "./lib/rough-cut.ts";
import { contactSheets, ffReport, fingerprint, levels, probe, shotAt, still } from "./lib/media.ts";
import { corrNear, ENVELOPE_STEP, envelope, topLags, wordsMatch } from "./lib/sync.ts";
import { placeBroll, type BrollSection, type Dump } from "./lib/broll.ts";
import { makeVoice } from "./lib/voice.ts";
import {
  arollOf, buildOf, checkPlan, clock, clockOffsetMs, emptyFcpxml, offsetMs, footageFiles, GROUPS, localIso, LOUD_AT_CUT_DB, MAIN_TITLE, MUSIC, musicFile, paths, readJson, readYaml, seconds, segmentAt, stemOf, transcriptText, W, H,
  type Plan, type Role, type Settings, type Source, type Summary, type Time, type TitleAt,
} from "./project.ts";
import type { Word } from "./types.ts";

const [cmd, name, ...rest] = process.argv.slice(2);
if (!cmd || !name || !/^[\p{Ll}\p{N}][\p{Ll}\p{N}-]*$/u.test(name)) {
  console.error("Usage: npm run video -- <init|sort|analyze|frame|level|sync|merge|check|build|broll|mcp> <name> …  (name: lowercase letters, digits, dashes)");
  process.exit(2);
}
const p = paths(name);
const log = (s: string) => console.log(s);
const rel = (f: string) => path.relative(process.cwd(), f);
const s1 = (ms: number) => Math.round(ms / 100) / 10;
const HERE = path.resolve("src", "resolve");

const commands: Record<string, () => Promise<void>> = { init, sort, analyze, frame, level, sync, merge, check, build, broll, mcp };
if (!commands[cmd]) throw new Error(`Unknown command ${cmd}`);
if (cmd !== "init" && !existsSync(p.settings)) throw new Error(`No project ${rel(p.dir)}: npm run video -- init ${name} <source folder>`);
await commands[cmd]();

// --- init ------------------------------------------------------------------------------

async function init() {
  const source = rest.find((a) => !a.startsWith("--"));
  if (!source || !existsSync(source)) throw new Error("Usage: npm run video -- init <name> <source folder> [--project <Resolve project>]  (the folder the footage was dropped in)");
  if (existsSync(p.settings)) throw new Error(`${rel(p.settings)} is there already`);
  const at = rest.indexOf("--project");
  const project = at >= 0 ? rest[at + 1] : name;
  await mkdir(p.dir, { recursive: true });
  const music = (await readdir(source)).filter((f) => MUSIC.test(f)).sort()[0];
  const settings: Settings = { source: path.resolve(source), resolve: { project, timeline: name }, language: "fi", ...(music ? { music } : {}) };
  await writeFile(p.settings, `# ${name}: settings of the video (see /edit-video)\n${YAML.stringify(settings)}` +
    "# musicDb: -18            # the music's level under the voice\n# titles: { main: \"Main title 2026 (merged)\", social: false }   # another composition than the template's, or false to leave one out\n# clocks: [{ match: \"1920x1080\", offset: \"+14:23:00\" }]   # a camera whose clock is off (npm run video -- sync finds it)\n");
  const q = paths(name);
  await mkdir(q.dir, { recursive: true });
  await copyFile(q.settings, q.settingsCopy);
  log(`${rel(p.settings)}: footage from ${source}${music ? `, music ${music}` : ", no music found there"}; Resolve project "${project}"; the analysis and plans go to ${q.dir}`);
  log(`Then: npm run -s video -- sort ${name}`);
}

// --- sort ------------------------------------------------------------------------------

async function sort() {
  const settings = await loadSettings();
  const files = footageFiles(settings);
  if (!files.length) throw new Error(`No videos in ${settings.source} (or its footage/ folder)`);
  if (!rest.length) {
    const todo = files.filter((f) => !f.role);
    if (!todo.length) {
      log("nothing to sort: every file has a role");
      for (const f of files) log(`  ${f.key}: ${f.role}`);
      return;
    }
    const dir = path.join(p.analysis, "sort");
    await mkdir(dir, { recursive: true });
    log(`${todo.length} files to sort (aroll: the talking head, the recording the cut follows; broll: footage to cut in over it; skip: not footage):`);
    for (const f of todo) {
      const r = probe(f.file);
      let sound = "no sound";
      if (r.hasAudio) {
        const quiet = await ffReport(["-i", f.file, "-vn", "-af", "silencedetect=noise=-35dB:d=0.5", "-f", "null", "-"]);
        const silent = [...quiet.matchAll(/silence_duration: ([\d.]+)/g)].reduce((a, m) => a + Number(m[1]), 0) * 1000;
        sound = `sound ${Math.round(Math.max(0, 1 - silent / r.durationMs) * 100)} % of the time`;
      }
      const every = Math.max(1, r.durationMs / 8000);
      const [sheet] = await contactSheets(f.file, r.durationMs, path.join(dir, f.key.replace(/[/. ]/g, "_")), every, { cols: 4, rows: 2, tileWidth: 400 });
      log(`\n${f.key}: ${r.width}×${r.height} ${r.fps.toFixed(3)} fps, ${clock(r.durationMs)}, ${sound}, camera ${r.camera ?? "unknown"}\n  look: ${rel(sheet.file)} (frames at ${sheet.times.map((t) => Math.round(t)).join(", ")} s)`);
    }
    log(`\nThen: npm run -s video -- sort ${name} "<file>=aroll" "<file>=broll" …  (every file, a role each)`);
    return;
  }
  const roles: Record<string, Role> = { ...(settings.roles ?? {}) };
  for (const a of rest) {
    const at = a.lastIndexOf("=");
    const [key, role] = [a.slice(0, at), a.slice(at + 1)];
    if (at < 0 || !["aroll", "broll", "skip"].includes(role)) throw new Error(`${a}: give <file>=aroll|broll|skip`);
    const f = files.find((f) => f.key === key || f.key === path.basename(key));
    if (!f) throw new Error(`${key} isn't one of the files: ${files.map((f) => f.key).join(", ")}`);
    roles[f.key] = role as Role;
  }
  const left = files.filter((f) => !roles[f.key]);
  if (left.length) throw new Error(`No role for ${left.map((f) => f.key).join(", ")}`);
  if (!Object.values(roles).includes("aroll")) throw new Error("No A-roll: the cut follows a talking head");
  await saveSettings({ ...settings, roles });
  for (const f of files) log(`${f.key}: ${roles[f.key]}`);
}

// --- analyze ---------------------------------------------------------------------------

async function analyze() {
  const force = rest.includes("--force");
  const settings = await loadSettings();
  const files = footageFiles(settings);
  const unsorted = files.filter((f) => !f.role);
  if (unsorted.length) throw new Error(`Not sorted yet: ${unsorted.map((f) => f.key).join(", ")}. First: npm run -s video -- sort ${name}`);
  const sources = files.filter((f) => f.role !== "skip").map((f): Source => {
    const r = probe(f.file);
    const src: Source = { ...r, file: f.file, key: f.key, role: f.role as "aroll" | "broll", ...(r.camera ? { group: GROUPS[r.camera] } : {}) };
    const shot = shotAt(f.file);
    if (shot) {
      src.shotAt = localIso(shot);
      src.realAt = localIso(new Date(shot.getTime() - clockOffsetMs(settings, src)));
    }
    return src;
  });
  const aroll = Object.fromEntries(sources.filter((s) => s.role === "aroll").map((s) => [s.key, s]));
  const broll = Object.fromEntries(sources.filter((s) => s.role === "broll").map((s) => [s.key, s]));
  const mains = Object.values(aroll);
  if (!mains.length) throw new Error("No A-roll");
  for (const m of mains) if (!m.hasAudio) throw new Error(`${m.key} has no sound: there's no voice to cut by`);
  const inputs = Object.fromEntries(sources.map((x) => [x.key, fingerprint(x.file)]));
  const old = existsSync(p.summary) ? await readJson<Summary>(p.summary) : undefined;
  const changed = old && mains.some((m) => old.inputs[m.key] !== inputs[m.key]);
  if (force || changed) {
    log(force ? "analysis: starting over (--force)" : "analysis: the A-roll changed, starting over");
    await rm(p.analysis, { recursive: true, force: true });
  }
  for (const d of [p.analysis, p.sheets, p.frames, p.tmp, p.cache]) await mkdir(d, { recursive: true });
  // The timeline's rate: the one most of the A-roll is shot at (a second camera's talk may run at another).
  const secondsAt = new Map<number, number>();
  for (const m of mains) secondsAt.set(m.fps, (secondsAt.get(m.fps) ?? 0) + m.durationMs);
  const fps = Math.round([...secondsAt.entries()].sort((a, b) => b[1] - a[1])[0][0] * 1000) / 1000;
  const summary: Summary = { fps, width: W, height: H, aroll, broll, inputs };
  await writeFile(p.summary, JSON.stringify(summary, null, 2));
  const music = musicFile(settings);
  if (settings.music && !existsSync(music!)) log(`warning: music ${settings.music} not found`);

  const missing: string[] = [];
  for (const m of mains) {
    const stem = stemOf(m.key);
    if (!existsSync(p.voice(stem))) await makeVoice(m.file, p.voice(stem), (s) => log(`${m.key}: ${s}`));
    else log(`${m.key}: voice done before`);
    if (!existsSync(p.silences(stem))) {
      const quiet = await ffReport(["-i", p.voice(stem), "-af", "silencedetect=noise=-40dB:d=0.12", "-f", "null", "-"]);
      const list = [...quiet.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)].map((x) => [Math.round(Number(x[1]) * 100) / 100, Math.round(Number(x[2]) * 100) / 100]);
      await writeFile(p.silences(stem), JSON.stringify({ about: `Stretches of 0.12 s or more where the voice of ${m.key} is under -40 dB, [from, to] in seconds of it. Cut inside these.`, silences: list }));
    }
    if (!existsSync(p.transcript(stem))) {
      missing.push(m.key);
      continue;
    }
    const words = await readJson<Word[]>(p.transcript(stem));
    await writeFile(p.transcriptText(stem), transcriptText(words));
    if (!existsSync(p.cuts(stem))) {
      const { keep, removed } = await roughCut(p.voice(stem), words);
      await writeFile(p.cuts(stem), JSON.stringify({
        about: `A first guess at what to keep of ${m.key}, in seconds of it: speech without pauses over 1 s, retakes and lone fillers. A starting point, not the plan.`,
        keep: keep.map((r) => [s1(r.fromMs), s1(r.toMs)]),
        removed: removed.map((r) => ({ from: s1(r.fromMs), to: s1(r.toMs), why: r.why })),
      }, null, 1));
    }
  }

  // Contact sheets: the A-roll every 5 s, each b-roll every 1–5 s by its length.
  const sheets = await readdir(p.sheets);
  const indexFile = path.join(p.sheets, "index.txt");
  const index: string[] = existsSync(indexFile) ? (await readFile(indexFile, "utf8")).split("\n").slice(1).filter(Boolean) : [];
  for (const s of sources) {
    const prefix = stemOf(s.key).replace(/[/. ]/g, "_");
    if (sheets.some((f) => f.startsWith(`${prefix}-`))) continue;
    const every = s.role === "aroll" ? 5 : Math.max(1, Math.min(5, Math.round(s.durationMs / 16000)));
    log(`sheets: ${s.key}, a frame every ${every} s`);
    const portrait = s.height > s.width;
    const cols = portrait ? 8 : 4;
    const made = await contactSheets(s.file, s.durationMs, path.join(p.sheets, prefix), every, { tileWidth: portrait ? 240 : 480, cols, rows: portrait ? 2 : 4 });
    index.push(...made.map((m) => `${path.basename(m.file)}: ${cols} a row, left to right, at ${m.times.join(", ")} s of ${s.key}`));
  }
  if (index.length) await writeFile(indexFile, `Seconds of each file's own time.\n${index.join("\n")}\n`);

  // Every clip in real time (the cameras' clocks corrected by project.yaml's clocks): the order of the shoot.
  const rows = sources.map((s) => {
    const words = existsSync(p.transcript(stemOf(s.key))) ? (JSON.parse(readFileSync(p.transcript(stemOf(s.key)), "utf8")) as Word[]).length : undefined;
    return { s, words };
  }).sort((a, b) => (a.s.realAt ?? "").localeCompare(b.s.realAt ?? "") || a.s.key.localeCompare(b.s.key));
  const hm = (iso?: string) => (iso ? iso.slice(11, 19) : "?");
  const endOf = (s: Source) => (s.realAt ? localIso(new Date(new Date(s.realAt).getTime() + s.durationMs)) : undefined);
  const clocksNote = (settings.clocks ?? []).map((c) => `${c.match}: clock = real ${String(c.offset).startsWith("-") ? "" : "+ "}${c.offset}`).join("; ");
  await writeFile(path.join(p.analysis, "chronology.txt"), [
    `Every clip in real time${clocksNote ? ` (${clocksNote})` : ""}; a file's own clock in shotAt of summary.json. Length in s, words transcribed.`,
    `${"real start".padEnd(10)} ${"real end".padEnd(8)} ${"file".padEnd(30)} ${"role".padEnd(6)} ${"camera".padEnd(8)} ${"size".padEnd(14)} ${"s".padStart(6)} ${"words".padStart(5)}`,
    ...rows.map(({ s, words }) => `${hm(s.realAt).padEnd(10)} ${hm(endOf(s)).padEnd(8)} ${s.key.padEnd(30)} ${s.role.padEnd(6)} ${(s.camera ?? "?").padEnd(8)} ${`${s.width}x${s.height}@${Math.round(s.fps * 100) / 100}`.padEnd(14)} ${(s.durationMs / 1000).toFixed(0).padStart(6)} ${words === undefined ? "    -" : String(words).padStart(5)}`),
    "",
  ].join("\n"));

  log(`\n${rel(p.analysis)}/`);
  for (const f of (await readdir(p.analysis)).sort()) log(`  ${f}`);
  log(`  chronology.txt: every clip in real time${settings.clocks?.length ? "" : " (no clocks in project.yaml: the cameras' own clocks; npm run video -- sync checks them)"}`);
  for (const m of mains) log(`A-roll: ${m.key}, ${m.width}×${m.height} ${m.fps.toFixed(3)} fps, ${clock(m.durationMs)}, camera ${m.camera ?? "unknown"} (the timeline is ${fps} fps)`);
  log(`b-roll: ${Object.values(broll).map((b) => `${b.key} (${clock(b.durationMs)}, ${b.camera ?? "unknown camera"})`).join(", ") || "none"}`);
  if (missing.length) log(`\nNO TRANSCRIPT yet for ${missing.join(", ")}: run the ingest script in Resolve (npm run -s video -- mcp ${name} ingest), then analyze again`);
}

// --- frame -----------------------------------------------------------------------------

async function frame() {
  const [what, at, box] = rest;
  if (!what || at === undefined) throw new Error("Usage: npm run video -- frame <name> <file> <seconds> [x,y,w,h]   (file: as in summary.json; cut frames come from Resolve: mcp still)");
  const summary = await readJson<Summary>(p.summary);
  const src = summary.aroll[what] ?? summary.broll[what];
  if (!src) throw new Error(`No ${what}: one of ${[...Object.keys(summary.aroll), ...Object.keys(summary.broll)].join(", ")}`);
  const ms = Math.round(seconds(at) * 1000);
  const b = box ? (box.split(/[ ,]+/).map(Number) as [number, number, number, number]) : undefined;
  await mkdir(p.frames, { recursive: true });
  const out = path.join(p.frames, `${stemOf(what)}-${(ms / 1000).toFixed(1)}${b ? "-box" : ""}.jpg`);
  // Full size, so a point read off it is in the file's own pixels.
  await still(src.file, ms, out, { box: b });
  log(rel(out));
}

// --- level -----------------------------------------------------------------------------

async function level() {
  const [fromS, toS, file] = rest;
  if (fromS === undefined || toS === undefined) throw new Error("Usage: npm run video -- level <name> <from> <to> [file]  (seconds of the A-roll file)");
  const summary = await readJson<Summary>(p.summary);
  const keys = Object.keys(summary.aroll);
  const key = file ?? (keys.length === 1 ? keys[0] : undefined);
  if (!key || !summary.aroll[key]) throw new Error(`Which A-roll? one of ${keys.join(", ")}`);
  const at = await levels(p.voice(stemOf(key)));
  const from = Math.round(seconds(fromS) * 1000);
  const to = Math.min(from + 30_000, Math.round(seconds(toS) * 1000));
  log(`dBFS of ${key}'s voice (speech about -20, quiet under -45, cuts are heard over ${LOUD_AT_CUT_DB}):`);
  for (let ms = from; ms <= to; ms += 50) {
    const db = at(ms);
    log(`${(ms / 1000).toFixed(2).padStart(7)}  ${String(Math.round(db)).padStart(4)}  ${"█".repeat(Math.max(0, Math.round((db + 70) / 2.5)))}`);
  }
}

// --- sync ------------------------------------------------------------------------------

/**
 * Two cameras: for each b-roll clip (or the ones named), where its sound fits in the A-roll of the
 * other camera, the clock offset that implies, and whether its words are in the A-roll (a second
 * angle) or not (talk only this clip has: A-roll material).
 */
async function sync() {
  const settings = await loadSettings();
  if (!existsSync(p.summary)) throw new Error(`No ${rel(p.summary)}: npm run video -- analyze ${name} first`);
  const summary = await readJson<Summary>(p.summary);
  const named = rest.filter((a, i) => !a.startsWith("--") && rest[i - 1] !== "--at");
  const all = { ...summary.aroll, ...summary.broll };
  const targets = named.length ? named.map((n) => all[n] ?? all[path.basename(n)]).filter(Boolean) : Object.values(summary.broll);
  if (!targets.length) throw new Error(`Nothing to sync: name b-roll files, or sort some first (${Object.keys(all).join(", ")})`);
  const sig = (s: Source) => `${s.width}x${s.height}@${Math.round(s.fps * 100) / 100}`;
  const arolls = Object.values(summary.aroll).filter((a) => shotAt(a.file));
  const envs = new Map<string, Float64Array>();
  const env = async (s: Source) => envs.get(s.key) ?? (envs.set(s.key, await envelope(s.file)), envs.get(s.key)!);
  const words: Record<string, Word[]> = {};
  for (const s of Object.values(all)) if (existsSync(p.transcript(stemOf(s.key)))) words[s.key] = await readJson<Word[]>(p.transcript(stemOf(s.key)));
  const sign = (ms: number) => {
    const s = Math.round(Math.abs(ms) / 100) / 10;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${ms < 0 ? "-" : "+"}${h}:${String(m).padStart(2, "0")}:${sec.toFixed(1).padStart(4, "0")}`;
  };
  const MIN_S = 8;
  // Cameras of one shoot start within an hour or so of each other: the offset is looked for near the
  // difference of the two cameras' first files (--any: anywhere). A long way off, a clip's best peak is noise.
  const firstA = Math.min(...arolls.filter((a) => sig(a) !== sig(targets[0])).map((a) => shotAt(a.file)!.getTime()));
  const firstB = Math.min(...targets.filter((t) => shotAt(t.file)).map((t) => shotAt(t.file)!.getTime()));
  const WINDOW = rest.includes("--any") ? Infinity : 90 * 60 * 1000;
  const guess = firstA - firstB;
  const inWindow = (ms: number) => Math.abs(ms - guess) <= WINDOW;
  log(`Each clip's sound against the A-roll of the other camera: where it fits (same sound = same moment), as A-roll clock − this clip's clock. The first files of the two cameras are ${sign(guess)} apart: the offset is looked for within ${Number.isFinite(WINDOW) ? "90 min" : "any distance"} of that (--any: anywhere). Clips under ${MIN_S} s are listed, not counted.\n`);
  type Peak = { ms: number; corr: number; a: Source; lag: number; key: string };
  const peaks: Peak[] = [];
  const realRange = (s: Source) => (s.realAt ? [new Date(s.realAt).getTime(), new Date(s.realAt).getTime() + s.durationMs] : undefined);
  const lines = new Map<string, string[]>();
  for (const t of targets) {
    const shot = shotAt(t.file);
    const others = arolls.filter((a) => sig(a) !== sig(t));
    const head = `${t.key}  ${clock(t.durationMs)}  ${words[t.key] ? `${words[t.key].length} words` : "no transcript"}`;
    const out: string[] = [];
    lines.set(t.key, out);
    if (!shot || !others.length) {
      out.push(`${head}: ${shot ? "no A-roll of another camera" : "no time stamp"}`);
      continue;
    }
    out.push(head);
    const b = await env(t);
    const mine: Peak[] = [];
    for (const a of others) {
      const ea = await env(a);
      if (ea.length <= b.length + 4) continue;
      for (const r of topLags(b, ea)) mine.push({ ...r, a, key: t.key, ms: shotAt(a.file)!.getTime() + r.lag * ENVELOPE_STEP * 1000 - shot.getTime() });
    }
    mine.sort((x, y) => y.corr - x.corr);
    const near = mine.filter((q) => inWindow(q.ms));
    if (t.durationMs >= MIN_S * 1000) peaks.push(...near);
    const best = near[0];
    if (best) out.push(`    best fit near the guess: ${best.a.key} @ ${(best.lag * ENVELOPE_STEP).toFixed(1)} s, corr ${best.corr.toFixed(2)}, offset ${sign(best.ms)}`);
    else out.push(`    no A-roll of the other camera near the guess`);
    // With the clocks known: was the A-roll camera rolling at the same time? Then this is a second angle, its talk in the A-roll.
    const r = realRange(t);
    const over = r ? Object.values(summary.aroll).filter((a) => a.key !== t.key && realRange(a) && realRange(a)![0] < r[1] && realRange(a)![1] > r[0]) : [];
    if (settings.clocks?.length) {
      if (over.length) out.push(`    real time: the A-roll was rolling (${over.map((a) => a.key).join(", ")}): a second angle, b-roll`);
      else if (words[t.key]?.length >= 4) out.push(`    real time: no A-roll was rolling: talk only this clip has — sort it aroll if it's said to the camera: "${words[t.key].map((w) => w.text).join(" ").slice(0, 100)}"`);
      else out.push(`    real time: no A-roll was rolling, no talk: b-roll`);
    }
    const bw = words[t.key];
    if (bw && bw.length >= 4) {
      let hit: { ratio: number; at: number; a: Source } | undefined;
      for (const a of Object.values(summary.aroll)) {
        if (a.key === t.key || !words[a.key]) continue;
        const m = wordsMatch(bw, words[a.key]);
        if (!hit || m.ratio > hit.ratio) hit = { ...m, a };
      }
      if (hit && hit.ratio >= 0.6) out.push(`    words: the same as ${hit.a.key} @ ${(words[hit.a.key][hit.at].startMs / 1000).toFixed(1)} s (${Math.round(hit.ratio * 100)} %)`);
    }
  }
  // The offset the clips share: every peak is a candidate; the one at which the most clips, together, correlate
  // with the A-roll that was rolling then (a single clip's peak is often noise, the sum over clips isn't).
  const counted = targets.filter((t) => t.durationMs >= MIN_S * 1000 && shotAt(t.file) && arolls.some((a) => sig(a) !== sig(t)));
  const score = async (ms: number) => {
    const per: { t: Source; a: Source; corr: number }[] = [];
    for (const t of counted) {
      const b = await env(t);
      const at = shotAt(t.file)!.getTime() + ms;
      for (const a of arolls) {
        if (sig(a) === sig(t)) continue;
        const lag = Math.round((at - shotAt(a.file)!.getTime()) / 1000 / ENVELOPE_STEP);
        const c = corrNear(b, await env(a), lag);
        if (!Number.isNaN(c.corr)) per.push({ t, a, corr: c.corr });
      }
    }
    // A pair's chance correlation is about 0.1–0.3: only what's above that counts.
    return { per, total: per.reduce((n, x) => n + Math.max(0, x.corr - 0.25), 0) };
  };
  const bins = new Map<number, number>();
  for (const q of peaks) if (q.corr >= 0.3) bins.set(Math.round(q.ms / 2000), q.ms);
  // --at <offset>: score that one too (a known or suspected offset), and say how it compares.
  const atArg = rest.indexOf("--at") >= 0 ? rest[rest.indexOf("--at") + 1] : undefined;
  if (atArg) {
    const ms = offsetMs(atArg);
    const r = await score(ms);
    log(`\n--at ${sign(ms)}: ${r.per.length} clips overlap the A-roll, score ${r.total.toFixed(2)}: ${r.per.map((x) => `${x.t.key.slice(-11, -6)}/${x.a.key.slice(-11, -6)} ${x.corr.toFixed(2)}`).join(", ")}`);
    bins.set(Math.round(ms / 1000), ms);
  }
  type Cand = { ms: number; total: number; per: { t: Source; a: Source; corr: number }[] };
  const cands: Cand[] = [];
  for (const ms of bins.values()) {
    const r = await score(ms);
    if (r.per.length >= 2) cands.push({ ms, ...r });
  }
  cands.sort((a, b) => b.total - a.total);
  let best: Cand | undefined = cands[0];
  if (cands.length > 1) {
    log(`\nCandidate offsets, best first (score: how much the overlapping clips correlate above chance; pairs over 0.3):`);
    for (const c of cands.slice(0, 5)) log(`  ${sign(c.ms)}  score ${c.total.toFixed(2)}, ${c.per.filter((x) => x.corr >= 0.3).length} of ${c.per.length} pairs: ${c.per.filter((x) => x.corr >= 0.3).map((x) => `${x.t.key.slice(-11, -6)}/${x.a.key.slice(-11, -6)} ${x.corr.toFixed(2)}`).join(", ")}`);
  }
  if (best) {
    // Refine: the offset the agreeing pairs point at.
    const agree = best.per.filter((x) => x.corr >= 0.3);
    if (agree.length) {
      const fine = await Promise.all(agree.map(async (x) => {
        const lag = Math.round((shotAt(x.t.file)!.getTime() + best!.ms - shotAt(x.a.file)!.getTime()) / 1000 / ENVELOPE_STEP);
        const n = corrNear(await env(x.t), await env(x.a), lag, 30, 1);
        return shotAt(x.a.file)!.getTime() + n.lag * ENVELOPE_STEP * 1000 - shotAt(x.t.file)!.getTime();
      }));
      fine.sort((a, b) => a - b);
      best = { ...best, ms: fine[Math.floor(fine.length / 2)] };
    }
    for (const x of best.per) lines.get(x.t.key)?.push(`    at the shared offset: with ${x.a.key}, corr ${x.corr.toFixed(2)}`);
    for (const out of lines.values()) log(out.join("\n"));
    const good = best.per.filter((x) => x.corr >= 0.3);
    log(`\nShared offset: A-roll clock − b-roll clock = ${sign(best.ms)}: ${best.per.length} of ${counted.length} clips overlap the A-roll there, ${good.length} of them correlate (over 0.3; mean ${(best.per.reduce((n, x) => n + x.corr, 0) / best.per.length).toFixed(2)}).${good.length < 3 ? " Few: confirm it with a sentence both cameras caught, or a frame of each at the same moment." : ""}`);
    const a0 = arolls.find((a) => sig(a) !== sig(targets[0]));
    if (a0 && !settings.clocks?.length) log(`If the b-roll camera's clock is right, put in project.yaml:\n  clocks: [{ match: "${a0.width}x${a0.height}", offset: "${sign(best.ms)}" }]\nthen analyze again (chronology.txt is in real time).`);
    else if (settings.clocks?.length) log(`project.yaml has clocks: ${JSON.stringify(settings.clocks)}: chronology.txt is in real time.`);
  } else {
    for (const out of lines.values()) log(out.join("\n"));
    log("\nNo offset at which the clips overlap the A-roll: the cameras may not have run at the same time, or the clips are too short.");
  }
}

// --- merge -----------------------------------------------------------------------------

/** A long video planned in parts: plan.part1.yaml … plan.partN.yaml, in that order, as one plan.yaml; titles.main from the first part that has it, titles.end from the last. */
async function merge() {
  const parts: { i: number; plan: Plan }[] = [];
  for (let i = 1; i <= 20; i++) {
    const f = path.join(p.dir, `plan.part${i}.yaml`);
    if (!existsSync(f)) continue;
    const plan = await readYaml<Plan>(f);
    if (!plan?.segments?.length) throw new Error(`${rel(f)}: no segments`);
    parts.push({ i, plan });
  }
  if (!parts.length) throw new Error(`No ${rel(path.join(p.dir, "plan.part1.yaml"))}: the parts of the plan`);
  const segments = parts.flatMap((x) => x.plan.segments.map((s) => ({ ...s, why: `[part ${x.i}] ${s.why ?? ""}`.trim() })));
  const titles: Plan["titles"] = {};
  const main = parts.find((x) => x.plan.titles?.main != null);
  const end = [...parts].reverse().find((x) => x.plan.titles?.end != null);
  if (main) titles.main = main.plan.titles!.main;
  if (end) titles.end = end.plan.titles!.end;
  const out: Plan = { segments, ...(Object.keys(titles).length ? { titles } : {}) };
  await writeFile(p.plan, `# ${name}: merged from ${parts.map((x) => `plan.part${x.i}.yaml`).join(", ")} (npm run video -- merge). Seconds of each segment's own file.\n${YAML.stringify(out)}`);
  log(`${rel(p.plan)}: ${segments.length} segments from ${parts.length} parts, ${new Set(segments.map((s) => s.file)).size} files; titles ${JSON.stringify(titles)}`);
}

// --- check -----------------------------------------------------------------------------

async function check() {
  const { summary, plan, words } = await loadPlan();
  const level: Record<string, (ms: number) => number> = {};
  for (const key of Object.keys(summary.aroll)) if (existsSync(p.voice(stemOf(key)))) level[key] = await levels(p.voice(stemOf(key)));
  const problems = checkPlan(plan, summary, words, level);
  for (const x of problems) log(`${x.level === "error" ? "ERROR  " : "warning"} ${x.where}: ${x.what}`);
  if (!problems.some((x) => x.level === "error")) {
    let at = 0;
    for (const [i, s] of plan.segments.entries()) {
      const main = arollOf(s, summary)!;
      const [from, to] = [Math.round(seconds(s.from) * 1000), Math.round(seconds(s.to) * 1000)];
      const ws = words[main.key] ?? [];
      const text = ws.filter((w) => Math.min(to, w.endMs) - Math.max(from, w.startMs) > (w.endMs - w.startMs) / 2).map((w) => w.text).join(" ");
      const extra = [s.zoom && s.zoom !== 1 ? `×${s.zoom}` : "", s.inserts?.length ? `${s.inserts.length} insert` : ""].filter(Boolean).join(", ");
      log(`  ${String(i + 1).padStart(2)}. ${clock(at)} ${extra.padEnd(14)} "${text.length > 90 ? `${text.slice(0, 87)}…` : text}"`);
      at += to - from;
    }
    const cutAt = (t: TitleAt) => {
      const hit = segmentAt(plan, summary, t);
      return hit ? clock(plan.segments.slice(0, hit.i).reduce((n, s) => n + Math.round((seconds(s.to) - seconds(s.from)) * 1000), 0) + hit.ms - Math.round(seconds(hit.seg.from) * 1000)) : "?";
    };
    if (plan.titles?.main != null) log(`  main title in the pause at ${cutAt(plan.titles.main)} of the cut (the talk stops ${MAIN_TITLE.pictureTo - MAIN_TITLE.pictureFrom} s for it)`);
    if (plan.titles?.end != null) log(`  end title from ${cutAt(plan.titles.end)}, over the sign-off`);
    log(`\n${plan.segments.length} segments, cut ${clock(at)}`);
  }
  if (problems.some((x) => x.level === "error")) process.exit(1);
  log(problems.length ? "no errors (see the warnings)" : "no problems");
}

// --- build -----------------------------------------------------------------------------

/** The plan file named with --plan, or plan.yaml; a short's plan has its own build.json (tmp/<plan>.build.json) and timeline. */
function planFile(): string {
  const at = rest.indexOf("--plan");
  return at >= 0 && rest[at + 1] ? path.resolve(p.dir, rest[at + 1]) : p.plan;
}
function buildFile(): string {
  const f = planFile();
  return f === p.plan ? p.build : path.join(p.tmp, `${path.basename(f).replace(/\.ya?ml$/, "")}.build.json`);
}

async function build() {
  const { summary, plan, words, settings } = await loadPlan();
  const pf = planFile();
  const errors = checkPlan(plan, summary, words).filter((x) => x.level === "error");
  if (errors.length) throw new Error(`The plan has errors: npm run video -- check ${name}${pf === p.plan ? "" : ` --plan ${rel(pf)}`}\n${errors.map((e) => `  ${e.where}: ${e.what}`).join("\n")}`);
  await mkdir(p.tmp, { recursive: true });
  const b = buildOf({ plan, summary, settings, p, planFile: pf });
  const out = buildFile();
  await writeFile(b.fcpxml, emptyFcpxml(b.timeline, b.fps, b.width, b.height));
  await writeFile(out, JSON.stringify(b, null, 1));
  log(`${rel(out)}: timeline "${b.timeline}" ${b.width}×${b.height}, ${b.aroll.length} A-roll pieces, ${b.broll.length} inserts, ${b.beeps ? `${b.beeps.items.length} beeps, ` : ""}${b.main ? "the main title, " : ""}${b.titles.length} titles, ${clock((b.lengthF / b.fps) * 1000)}${b.music ? ", music" : ""}`);
  log(`\nNow run this through the Resolve MCP (run_script_unsafe, timeout 60):\n`);
  log(bootstrap("build", { build: out, force: rest.includes("--force") }));
}

// --- broll -----------------------------------------------------------------------------

/**
 * A b-roll pass on the timeline as it is now (`mcp dump` first): every usable section of the
 * second camera (analysis/broll-sections.json, or broll-sections.part*.json merged) goes on V2
 * where the A-roll shot at the same real moment sits in the cut, in the first free slot, in
 * ride order; nothing on V1 moves. Writes tmp/broll.json for `mcp <name> broll`.
 */
async function broll() {
  const num = (flag: string, dflt: number) => (rest.indexOf(flag) >= 0 ? Number(rest[rest.indexOf(flag) + 1]) : dflt);
  const summary = await readJson<Summary>(p.summary);
  const dumpFile = path.join(p.tmp, "timeline.json");
  if (!existsSync(dumpFile)) throw new Error(`No ${rel(dumpFile)}: run npm run video -- mcp ${name} dump first (the timeline as it is now)`);
  const dump = await readJson<Dump>(dumpFile);
  const files = [path.join(p.analysis, "broll-sections.json"), ...(await readdir(p.analysis)).filter((f) => /^broll-sections\.part\d+\.json$/.test(f)).sort().map((f) => path.join(p.analysis, f))].filter((f) => existsSync(f));
  if (!files.length) throw new Error(`No ${rel(path.join(p.analysis, "broll-sections.json"))} (or broll-sections.partN.json): the analyzer lists the usable sections of the b-roll first`);
  const sections: BrollSection[] = [];
  for (const f of files) sections.push(...(await readJson<BrollSection[]>(f)));
  const { placed, skipped, twice, order, cutEndS } = placeBroll(dump, summary, sections, { maxLen: num("--max-len", 10), gap: num("--gap", 4), maxShift: num("--shift", 240), keepTalk: rest.includes("--talk") });
  const groupOf = (key: string) => (summary.broll[key] ?? summary.aroll[key])?.group;
  await mkdir(p.tmp, { recursive: true });
  await writeFile(path.join(p.tmp, "broll.json"), JSON.stringify({ project: (await loadSettings()).resolve?.project ?? name, items: placed.map((x) => ({ ...x, ...(groupOf(x.key) ? { group: groupOf(x.key) } : {}) })) }, null, 1));
  log(`${sections.length} sections, ${placed.length} to place (${clock(placed.reduce((n, x) => n + x.lenS, 0) * 1000)}), ${skipped.length} skipped; the cut is ${clock(cutEndS * 1000)} with ${(dump.tracks[Object.keys(dump.tracks).find((k) => k.startsWith("video 2 ")) ?? ""] ?? []).length} inserts on V2 already`);
  for (const x of placed) log(`  ${clock(x.atS * 1000).padStart(7)}  ${x.key} ${(x.inF / (summary.broll[x.key] ?? summary.aroll[x.key]).fps).toFixed(1)}–${(x.outF / (summary.broll[x.key] ?? summary.aroll[x.key]).fps).toFixed(1)} s  rot ${String(x.rotation).padStart(4)}  shift ${String(x.shiftS).padStart(6)} s  ${x.what}`);
  for (const s of skipped) log(`  skipped ${s.file} ${s.from}–${s.to}: ${s.why}`);
  if (twice.length) {
    log(`\n${twice.length} stretch${twice.length === 1 ? "" : "es"} of a file on the timeline twice (never use the same b-roll twice; take one out in Resolve):`);
    for (const t of twice) log(`  ${t.file} ${t.from.toFixed(1)}–${t.to.toFixed(1)} s again on ${t.where}`);
  }
  if (order.length) {
    log(`\n${order.length} insert${order.length === 1 ? "" : "s"} on V2 out of ride order (the video is chronological; move or take out in Resolve):`);
    for (const t of order) log(`  ${t.file} on ${t.where} was shot before ${t.before}`);
  }
  if (placed.length) log(`\nNow: npm run -s video -- mcp ${name} broll  (and run its Python through the Resolve MCP)`);
}
// --- mcp -------------------------------------------------------------------------------

/** The Python to give the Resolve MCP: a script of src/resolve/, with its arguments. */
function bootstrap(script: string, args: Record<string, unknown>) {
  const run = (f: string) => `exec(compile(open(${JSON.stringify(path.join(HERE, f))}).read(), ${JSON.stringify(f)}, "exec"))`;
  // The arguments as JSON parsed in Python: JSON's true/false/null aren't Python literals.
  return `ARGS = __import__("json").loads(${JSON.stringify(JSON.stringify(args))})\n${run("common.py")}\n${run(`${script}.py`)}`;
}

async function mcp() {
  const [what, ...args] = rest;
  const settings = await loadSettings();
  const project = settings.resolve?.project ?? name;
  const timeline = settings.resolve?.timeline ?? name;
  switch (what) {
    case "ingest": {
      const files = footageFiles(settings).filter((f) => f.role && f.role !== "skip");
      const music = musicFile(settings);
      // --all: the b-roll transcribed too, to find talk in it (a clip with talk belongs on the A-roll track).
      const spoken = args.includes("--all") ? files : files.filter((f) => f.role === "aroll");
      log(bootstrap("ingest", {
        project,
        footage: files.map((f) => ({ path: f.file, role: f.role })),
        ...(music && existsSync(music) ? { music } : {}),
        language: settings.language ?? "fi",
        transcripts: spoken.map((f) => ({ path: f.file, out: p.transcript(stemOf(f.key)) })),
      }));
      return;
    }
    case "build": {
      const out = buildFile();
      if (!existsSync(out)) throw new Error(`No ${rel(out)}: npm run video -- build ${name}${out === p.build ? "" : ` --plan ${rel(planFile())}`}`);
      log(bootstrap("build", { build: out, force: args.includes("--force") }));
      return;
    }
    case "dump": {
      // --timeline <name>: another timeline of the project (a short), dumped to tmp/<name>.timeline.json.
      const t = args.indexOf("--timeline");
      const tlName = t >= 0 && args[t + 1] ? args[t + 1] : timeline;
      await mkdir(p.tmp, { recursive: true });
      log(bootstrap("dump", { project, timeline: tlName, out: path.join(p.tmp, tlName === timeline ? "timeline.json" : `${tlName}.timeline.json`) }));
      return;
    }
    case "broll": {
      const items = path.join(p.tmp, "broll.json");
      if (!existsSync(items)) throw new Error(`No ${rel(items)}: npm run video -- broll ${name}`);
      log(bootstrap("broll", { project, timeline, items }));
      return;
    }
    case "still": {
      const [at] = args;
      if (at === undefined) throw new Error("Usage: npm run video -- mcp <name> still <seconds of the cut>");
      await mkdir(p.frames, { recursive: true });
      log(bootstrap("still", { project, timeline, seconds: seconds(at), out: path.join(p.frames, `cut-${seconds(at).toFixed(1)}.png`) }));
      return;
    }
    default:
      throw new Error("Usage: npm run video -- mcp <name> <ingest|build|dump|still|broll> …");
  }
}

// ---------------------------------------------------------------------------------------

async function loadSettings(): Promise<Settings> {
  const s = (await readYaml<Settings>(p.settings)) ?? ({} as Settings);
  if (!s.source) throw new Error(`${rel(p.settings)} has no source: the folder the footage is in`);
  return s;
}

async function saveSettings(s: Settings) {
  const old = existsSync(p.settings) ? await readFile(p.settings, "utf8") : "";
  const head = old.split("\n").filter((l) => l.startsWith("#") && !/^#\s*(musicDb|titles|clocks)/.test(l)).join("\n");
  const tail = old.split("\n").filter((l) => /^#\s*(musicDb|titles|clocks)/.test(l)).join("\n");
  await writeFile(p.settings, `${head ? `${head}\n` : ""}${YAML.stringify(s)}${tail ? `${tail}\n` : ""}`);
  if (existsSync(path.dirname(p.settingsCopy))) await copyFile(p.settings, p.settingsCopy);
}

async function loadPlan() {
  const planFile_ = planFile();
  if (!existsSync(p.summary)) throw new Error(`No ${rel(p.summary)}: npm run video -- analyze ${name}`);
  if (!existsSync(planFile_)) throw new Error(`No ${rel(planFile_)}: the planner writes it`);
  const summary = await readJson<Summary>(p.summary);
  const words: Record<string, Word[]> = {};
  for (const key of Object.keys(summary.aroll)) {
    const f = p.transcript(stemOf(key));
    if (!existsSync(f)) throw new Error(`No ${rel(f)}: run the ingest script in Resolve (npm run video -- mcp ${name} ingest), then analyze`);
    words[key] = await readJson<Word[]>(f);
  }
  return { summary, plan: await readYaml<Plan>(planFile_), words, settings: await loadSettings() };
}
