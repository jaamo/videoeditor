// Transcribe a screen recording with Whisper, word by word: the overview to plan an edit from.
//   npm run transcribe -- "screencasts/2026-10-19 16-08-24.mp4" [--lang fi] [--prompt "Outerview, Maya"]
// Writes projects/<name>/transcript.json (for the tool) and transcript.txt (to read).
// Over long silences Whisper's timings drift; `npm run cut` transcribes each kept clip again,
// on its own, for captions that are on time.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Language } from "@remotion/install-whisper-cpp";
import { projectDir, projectName, type Transcript } from "./project.ts";
import { ensureWhisper, MODEL, toWhisperWav, whisperWords } from "./whisper.ts";

const args = process.argv.slice(2);
const langAt = args.indexOf("--lang");
const lang = (langAt >= 0 ? args.splice(langAt, 2)[1] : "fi") as Language;
const promptAt = args.indexOf("--prompt");
const prompt = promptAt >= 0 ? args.splice(promptAt, 2)[1] : undefined;
const source = args.find((a) => !a.startsWith("--"));
if (!source || !existsSync(source)) throw new Error('Usage: npm run transcribe -- "screencasts/<file>.mp4" [--lang fi]');

const name = projectName(source);
const dir = projectDir(name);
await mkdir(dir, { recursive: true });
await ensureWhisper();

console.log("extracting audio");
const wav = path.join(dir, "transcript.audio.wav");
await toWhisperWav(source, wav);

console.log(`transcribing (${MODEL}, ${lang})`);
let shown = -1;
const { words, language } = await whisperWords(wav, {
  lang,
  prompt,
  onProgress: (p) => {
    const pct = Math.floor(p * 10) * 10;
    if (pct > shown) console.log(`  ${(shown = pct)}%`);
  },
});

const transcript: Transcript = { source, language, model: MODEL, words };
await writeFile(path.join(dir, "transcript.json"), JSON.stringify(transcript, null, 1));
await writeFile(path.join(dir, "transcript.txt"), readable(words));
console.log(`${words.length} words → ${path.join(dir, "transcript.txt")}`);

/** One line per phrase, broken at pauses and sentence ends, timed: what to edit from. */
function readable(words: Transcript["words"]): string {
  const lines: string[] = [];
  let cur: typeof words = [];
  const flush = () => {
    if (cur.length) lines.push(`[${clock(cur[0].startMs)} – ${clock(cur.at(-1)!.endMs)}] ${cur.map((w) => w.text).join(" ")}`);
    cur = [];
  };
  for (const w of words) {
    if (cur.length && w.startMs - cur.at(-1)!.endMs > 600) flush();
    cur.push(w);
    if (/[.!?]$/.test(w.text) && cur.length > 2) flush();
  }
  flush();
  return lines.join("\n") + "\n";
}

function clock(ms: number) {
  const s = ms / 1000;
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}
