import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  downloadWhisperModel,
  installWhisperCpp,
  toCaptions,
  transcribe,
  type Language,
} from "@remotion/install-whisper-cpp";
import type { Word } from "../types.ts";

/** The last whisper.cpp that builds with plain make; later ones need cmake. */
const WHISPER_VERSION = "1.7.2";
const WHISPER_DIR = path.resolve("whisper.cpp");
export const MODEL = "large-v3-turbo";
/** Names Whisper should know how to spell. */
export const DEFAULT_PROMPT = "Outerview, Maya, LinkedIn, tekoäly.";

/** Builds whisper.cpp and fetches the model the first time (~1.6 GB). */
export async function ensureWhisper() {
  if (!existsSync(path.join(WHISPER_DIR, "main"))) {
    console.log("building whisper.cpp (once)");
    await installWhisperCpp({ to: WHISPER_DIR, version: WHISPER_VERSION, printOutput: false });
  }
  await downloadWhisperModel({ model: MODEL, folder: WHISPER_DIR, printOutput: false });
}

/** Words in a 16kHz mono WAV, timed in ms from its start. */
export async function whisperWords(
  wav: string,
  opts: { lang: Language; prompt?: string; onProgress?: (p: number) => void },
): Promise<{ words: (Word & { confidence?: number })[]; language: string }> {
  const out = await transcribe({
    inputPath: wav,
    whisperPath: WHISPER_DIR,
    whisperCppVersion: WHISPER_VERSION,
    model: MODEL,
    modelFolder: WHISPER_DIR,
    tokenLevelTimestamps: true,
    language: opts.lang,
    splitOnWord: true,
    printOutput: false,
    additionalArgs: [
      // Each 30s window on its own. With the text before it as context, Whisper falls into
      // loops over long silences (waiting for the AI), repeating the last line for minutes.
      ["--max-context", "0"],
      ["--prompt", opts.prompt ?? DEFAULT_PROMPT],
    ],
    onProgress: opts.onProgress,
  });
  const words = toCaptions({ whisperCppOutput: out })
    .captions.map((c) => ({ text: c.text.trim(), startMs: c.startMs, endMs: c.endMs, confidence: c.confidence ?? undefined }))
    .filter((w) => w.text);
  return { words, language: out.result.language };
}

/** Cut a piece of audio out to the 16kHz mono WAV Whisper wants. */
export function toWhisperWav(input: string, output: string, range?: { fromMs: number; toMs: number }) {
  const cut = range ? ["-ss", String(range.fromMs / 1000), "-to", String(range.toMs / 1000)] : [];
  return ffmpeg(["-v", "error", "-y", ...cut, "-i", input, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", output]);
}

/** The ffmpeg Remotion ships. Its build is slim: few filters, no raw PCM output. */
export function ffmpeg(args: string[], stdout?: (chunk: Buffer) => void) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn("npx", ["remotion", "ffmpeg", ...args], { stdio: ["ignore", stdout ? "pipe" : "ignore", "inherit"] });
    if (stdout) p.stdout!.on("data", stdout);
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
  });
}
