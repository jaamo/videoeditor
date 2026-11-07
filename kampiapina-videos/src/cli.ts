// The work the agents hand off: exact or slow, so done by code, once.
//   npm run video -- init <name> <source folder> [--project <Resolve project>]
//   npm run video -- sort <name> [file=aroll|broll|skip …]   the dropped files: what they look like, then their roles
//   npm run video -- analyze <name> [--force]   voice, silences, the transcript as text, a first guess, contact sheets
//   npm run video -- frame <name> <file> <seconds> [x,y,w,h]
//   npm run video -- level <name> <from> <to> [file]   the voice's loudness, to cut in the quiet
//   npm run video -- check <name>               the plan's problems
//   npm run video -- build <name> [--force]     the plan as tmp/build.json, and the Resolve script to run
//   npm run video -- mcp <name> <ingest|build|dump|still> [args…]   the Python to run through the Resolve MCP
// Times are seconds of the A-roll file, except where they're of the cut.
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { roughCut } from "./lib/rough-cut.ts";
import { contactSheets, ffReport, fingerprint, levels, probe, still } from "./lib/media.ts";
import { makeVoice } from "./lib/voice.ts";
import {
  arollOf, buildOf, checkPlan, clock, emptyFcpxml, footageFiles, GROUPS, LOUD_AT_CUT_DB, MAIN_TITLE, MUSIC, musicFile, paths, readJson, readYaml, seconds, segmentAt, stemOf, transcriptText, W, H,
  type Plan, type Role, type Settings, type Source, type Summary, type Time,
} from "./project.ts";
import type { Word } from "./types.ts";

const [cmd, name, ...rest] = process.argv.slice(2);
if (!cmd || !name || !/^[\p{Ll}\p{N}][\p{Ll}\p{N}-]*$/u.test(name)) {
  console.error("Usage: npm run video -- <init|sort|analyze|frame|level|check|build|mcp> <name> …  (name: lowercase letters, digits, dashes)");
  process.exit(2);
}
const p = paths(name);
const log = (s: string) => console.log(s);
const rel = (f: string) => path.relative(process.cwd(), f);
const s1 = (ms: number) => Math.round(ms / 100) / 10;
const HERE = path.resolve("src", "resolve");

const commands: Record<string, () => Promise<void>> = { init, sort, analyze, frame, level, check, build, mcp };
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
    "# musicDb: -18            # the music's level under the voice\n# titles: { main: \"Main title 2026 (merged)\", social: false }   # another composition than the template's, or false to leave one out\n");
  log(`${rel(p.settings)}: footage from ${source}${music ? `, music ${music}` : ", no music found there"}; Resolve project "${project}"`);
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
    return { ...r, file: f.file, key: f.key, role: f.role as "aroll" | "broll", ...(r.camera ? { group: GROUPS[r.camera] } : {}) };
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
  for (const d of [p.analysis, p.sheets, p.frames, p.tmp]) await mkdir(d, { recursive: true });
  const fps = Math.round(mains[0].fps * 1000) / 1000;
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

  log(`\n${rel(p.analysis)}/`);
  for (const f of (await readdir(p.analysis)).sort()) log(`  ${f}`);
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
    const cutAt = (t: Time) => {
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

async function build() {
  const { summary, plan, words, settings } = await loadPlan();
  const errors = checkPlan(plan, summary, words).filter((x) => x.level === "error");
  if (errors.length) throw new Error(`The plan has errors: npm run video -- check ${name}\n${errors.map((e) => `  ${e.where}: ${e.what}`).join("\n")}`);
  await mkdir(p.tmp, { recursive: true });
  const b = buildOf({ plan, summary, settings, p });
  await writeFile(p.fcpxml, emptyFcpxml(b.timeline, b.fps, b.width, b.height));
  await writeFile(p.build, JSON.stringify(b, null, 1));
  log(`${rel(p.build)}: ${b.aroll.length} A-roll pieces, ${b.broll.length} inserts, ${b.main ? "the main title, " : ""}${b.titles.length} titles, ${clock((b.lengthF / b.fps) * 1000)}${b.music ? ", music" : ""}`);
  log(`\nNow run this through the Resolve MCP (run_script_unsafe, timeout 60):\n`);
  log(bootstrap("build", { build: p.build, force: rest.includes("--force") }));
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
      log(bootstrap("ingest", {
        project,
        footage: files.map((f) => ({ path: f.file, role: f.role })),
        ...(music && existsSync(music) ? { music } : {}),
        language: settings.language ?? "fi",
        transcripts: files.filter((f) => f.role === "aroll").map((f) => ({ path: f.file, out: p.transcript(stemOf(f.key)) })),
      }));
      return;
    }
    case "build":
      if (!existsSync(p.build)) throw new Error(`No ${rel(p.build)}: npm run video -- build ${name}`);
      log(bootstrap("build", { build: p.build, force: args.includes("--force") }));
      return;
    case "dump":
      await mkdir(p.tmp, { recursive: true });
      log(bootstrap("dump", { project, timeline, out: path.join(p.tmp, "timeline.json") }));
      return;
    case "still": {
      const [at] = args;
      if (at === undefined) throw new Error("Usage: npm run video -- mcp <name> still <seconds of the cut>");
      await mkdir(p.frames, { recursive: true });
      log(bootstrap("still", { project, timeline, seconds: seconds(at), out: path.join(p.frames, `cut-${seconds(at).toFixed(1)}.png`) }));
      return;
    }
    default:
      throw new Error("Usage: npm run video -- mcp <name> <ingest|build|dump|still> …");
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
  const head = old.split("\n").filter((l) => l.startsWith("#") && !/^#\s*(musicDb|titles)/.test(l)).join("\n");
  const tail = old.split("\n").filter((l) => /^#\s*(musicDb|titles)/.test(l)).join("\n");
  await writeFile(p.settings, `${head ? `${head}\n` : ""}${YAML.stringify(s)}${tail ? `${tail}\n` : ""}`);
}

async function loadPlan() {
  if (!existsSync(p.summary)) throw new Error(`No ${rel(p.summary)}: npm run video -- analyze ${name}`);
  if (!existsSync(p.plan)) throw new Error(`No ${rel(p.plan)}: the planner writes it`);
  const summary = await readJson<Summary>(p.summary);
  const words: Record<string, Word[]> = {};
  for (const key of Object.keys(summary.aroll)) {
    const f = p.transcript(stemOf(key));
    if (!existsSync(f)) throw new Error(`No ${rel(f)}: run the ingest script in Resolve (npm run video -- mcp ${name} ingest), then analyze`);
    words[key] = await readJson<Word[]>(f);
  }
  return { summary, plan: await readYaml<Plan>(p.plan), words, settings: await loadSettings() };
}
