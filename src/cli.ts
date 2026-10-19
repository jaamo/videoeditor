// npm run make -- <video> [--lang fi] [--revoice] [--rerecord] [--fresh] [--no-render]
// npm run studio -- <video> [--lang fi]   preview and scrub in Remotion Studio
//
// Voice and recording are cached and reused until what they were made from changes.
// --revoice regenerates the narration, --rerecord records again, --fresh does both.
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { record, type Recording } from "./record.ts";
import type { Card, Localized, Manifest, VideoScript, Word } from "./types.ts";
import { INTRO_LEAD_MS, INTRO_MS, INTRO_TAIL_MS } from "./remotion/theme.ts";
import { narrate, type Narration } from "./voice.ts";

const args = process.argv.slice(2);
const langArg = args.findIndex((a) => a === "--lang");
const langValue = langArg >= 0 ? args.splice(langArg, 2)[1] : undefined;
const flags = new Set(args.filter((a) => a.startsWith("--")));
const name = args.find((a) => !a.startsWith("--"));
if (!name) throw new Error("Usage: npm run make -- <video> [--lang fi]   (a file in videos/, without .ts)");

const FPS = 30;
const script: VideoScript = (await import(path.resolve("videos", `${name}.ts`))).default;
const lang = langValue ?? script.lang ?? "en";
// One build per language: the recording is paced to that language's narration.
const outDir = path.resolve("out", name, lang);
await mkdir(outDir, { recursive: true });

/** Pick this build's language out of a Localized value. */
function t(v: Localized): string;
function t(v: Localized | undefined): string | undefined;
function t(v: Localized | undefined) {
  if (v === undefined || typeof v === "string") return v;
  if (!(lang in v)) throw new Error(`No "${lang}" text for: ${JSON.stringify(v)}`);
  return v[lang];
}
const card = (c: VideoScript["title"]): Card => ({ headline: t(c.headline), sub: t(c.sub), url: t(c.url) });

const revoice = flags.has("--revoice") || flags.has("--fresh");
const rerecord = flags.has("--rerecord") || flags.has("--fresh");

if (!flags.has("--studio")) {
  // 1. Voice ---------------------------------------------------------------------------
  console.log(revoice ? "voice (regenerating)" : "voice");
  const hasVoice = !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
  if (!hasVoice) console.log("  ElevenLabs is not set up in .env: using silent placeholder timings");
  await rm(path.join(outDir, "voice"), { recursive: true, force: true });
  await mkdir(path.join(outDir, "voice"), { recursive: true });
  const lines = script.steps.map((s) => t(s.say));
  const introLine = script.intro && t(script.intro.say);

  let intro: Manifest["intro"];
  let introMs = INTRO_MS;
  if (introLine) {
    if (hasVoice) {
      const n = withVoiceEnd(
        await narrate(introLine, { lang, model: script.model, next: lines.find(Boolean), force: revoice }),
        script.intro!.voiceEnd,
      );
      await writeFile(path.join(outDir, "voice/intro.mp3"), n.mp3);
      intro = { audio: "voice/intro.mp3", audioEndMs: n.speechEndMs, startMs: INTRO_LEAD_MS, words: n.words };
      introMs = Math.max(INTRO_MS, INTRO_LEAD_MS + n.durationMs + INTRO_TAIL_MS);
    } else {
      const p = placeholderTimings(introLine);
      intro = { startMs: INTRO_LEAD_MS, words: p.words };
      introMs = Math.max(INTRO_MS, INTRO_LEAD_MS + p.durationMs + INTRO_TAIL_MS);
    }
  }
  // One line at a time: ElevenLabs plans cap concurrent requests, at 3 on the smaller ones.
  const voice: { audio?: string; audioEndMs?: number; words: Word[]; durationMs: number }[] = [];
  for (const [i, line] of lines.entries()) {
    if (!line) voice.push({ words: [], durationMs: 0 });
    else if (!hasVoice) voice.push(placeholderTimings(line));
    else {
      const previous = i === 0 ? introLine : lines[i - 1];
      const n = withVoiceEnd(
        await narrate(line, { lang, model: script.model, previous, next: lines[i + 1], force: revoice }),
        script.steps[i].voiceEnd,
      );
      const audio = `voice/${i}.mp3`;
      await writeFile(path.join(outDir, audio), n.mp3);
      voice.push({ audio, audioEndMs: n.speechEndMs, words: n.words, durationMs: n.durationMs });
    }
  }

  // 2. Record --------------------------------------------------------------------------
  const recPath = path.join(outDir, "recording.json");
  const minStepMs = voice.map((v) => v.durationMs);
  const fingerprint = recordingFingerprint(script, minStepMs);
  const cached: (Recording & { fingerprint?: string }) | null = existsSync(recPath)
    ? JSON.parse(await readFile(recPath, "utf8"))
    : null;
  let rec: Recording;
  if (cached && cached.fingerprint === fingerprint && !rerecord) {
    console.log("record (reusing the cached recording)");
    rec = cached;
  } else {
    console.log(`record (${rerecord ? "--rerecord" : cached ? "script or narration changed" : "nothing cached yet"})`);
    // Live AI steps flake now and then (a reply with no edit in it); setup puts the data
    // back, so another take starts clean.
    for (let attempt = 1; ; attempt++) {
      try {
        rec = await record(script, outDir, minStepMs);
        break;
      } catch (e) {
        if (attempt >= 3) throw e;
        console.log(`  take ${attempt} failed (${(e as Error).message.split("\n")[0]}); recording again`);
      }
    }
    await writeFile(recPath, JSON.stringify({ ...rec, fingerprint }));
    console.log(`  ${rec.frames.length} frames, ${(rec.durationMs / 1000).toFixed(1)}s`);
  }

  // 3. Assets + manifest ---------------------------------------------------------------
  await cp(path.resolve("assets/brand"), path.join(outDir, "brand"), { recursive: true });
  let music: string | undefined;
  if (script.music) {
    if (existsSync(script.music)) {
      music = `music${path.extname(script.music)}`;
      await cp(path.resolve(script.music), path.join(outDir, music));
    } else console.log(`  no music: ${script.music} not found`);
  }
  const manifest: Manifest = {
    fps: FPS,
    lang,
    introMs,
    intro,
    viewport: rec.viewport,
    title: card(script.title),
    end: card(script.end),
    music,
    screenDurationMs: rec.durationMs,
    frames: rec.frames,
    events: rec.events,
    steps: script.steps.map((s, i) => ({ ...rec.steps[i], label: t(s.label), audio: voice[i].audio, audioEndMs: voice[i].audioEndMs, words: voice[i].words })),
  };
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest));
}

// 4. Render ------------------------------------------------------------------------------
const remotionArgs = ["src/remotion/index.ts", `--public-dir=${outDir}`, `--props=${path.join(outDir, "manifest.json")}`];
if (flags.has("--studio")) {
  await run("npx", ["remotion", "studio", ...remotionArgs]);
} else if (!flags.has("--no-render")) {
  console.log("render");
  const mp4 = path.join(outDir, `${name}.${lang}.mp4`);
  await run("npx", ["remotion", "render", remotionArgs[0], "Video", mp4, ...remotionArgs.slice(1), "--concurrency=50%"]);
  console.log(`\n${mp4}`);
}

/**
 * Everything a recording depends on. If any of it changes, the cached recording no
 * longer matches its narration or its script, and is made again. Step code counts by
 * its source text, and the recorder itself counts too.
 */
function recordingFingerprint(script: VideoScript, minStepMs: number[]) {
  const recorderSource = readFileSync(new URL("./record.ts", import.meta.url), "utf8");
  return createHash("sha256")
    .update(
      JSON.stringify({
        start: script.start,
        viewport: script.viewport,
        setup: script.setup?.toString(),
        steps: script.steps.map((s) => [s.do?.toString(), s.pauseAfterMs]),
        minStepMs,
        recorderSource,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

/** A hand-set end for this language's take, over the detected one. */
function withVoiceEnd(n: Narration, ends: Record<string, number> | undefined): Narration {
  const end = ends?.[lang];
  if (end === undefined) return n;
  const words = n.words.map((w) => ({ ...w, startMs: Math.min(w.startMs, end), endMs: Math.min(w.endMs, end) }));
  return { ...n, words, speechEndMs: end, durationMs: end + 100 };
}

/** Without a voice, pretend to speak at ~150 words a minute so timing and captions still work. */
function placeholderTimings(text: string) {
  const words = text.replace(/\[[^\]]*\]/g, " ").split(/\s+/).filter(Boolean).map((w, i) => ({ text: w, startMs: i * 400, endMs: i * 400 + 360 }));
  return { words, durationMs: words.length * 400 + 200 };
}

function run(cmd: string, argv: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: "inherit" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${argv[0]} exited with ${code}`))));
  });
}
