import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import type { Word } from "../types.ts";

/** OpenAI's Whisper: the one of its speech-to-text models that times each word. */
export const MODEL = "whisper-1";
/** Names Whisper should know how to spell. */
export const DEFAULT_PROMPT = "Kampiapina, YouTube, Shorts.";
/** The API takes up to 25 MB a request: 10 minutes of 16 kHz mono WAV is 19 MB. */
const CHUNK_S = 600;
/** A piece ends at the quietest moment this close to CHUNK_S, so no word is cut in two. */
const SNAP_S = 5;

/** OPENAI_API_KEY, from .env. */
export async function ensureWhisper() {
  if (!process.env.OPENAI_API_KEY) throw new Error("Transcribing needs OPENAI_API_KEY in .env (platform.openai.com/api-keys)");
}

/**
 * Words in a 16kHz mono WAV, timed in ms from its start. A long one goes up in pieces of
 * about CHUNK_S, each cut where it's quiet.
 */
export async function whisperWords(
  wav: string,
  opts: { lang: string; prompt?: string; onProgress?: (p: number) => void },
): Promise<{ words: Word[]; language: string }> {
  await ensureWhisper();
  const buf = await readFile(wav);
  const rate = buf.readUInt32LE(24);
  const data = buf.indexOf("data", 12, "ascii") + 8;
  const pcm = new Int16Array(Buffer.from(buf.subarray(data)).buffer);

  const words: Word[] = [];
  let language = opts.lang;
  let from = 0;
  while (from < pcm.length) {
    const to = pcm.length - from <= (CHUNK_S + SNAP_S) * rate ? pcm.length : quietest(pcm, rate, from + CHUNK_S * rate);
    const offsetMs = (from / rate) * 1000;
    const piece = await transcribe(wavOf(pcm.subarray(from, to), rate), opts.lang, opts.prompt ?? DEFAULT_PROMPT);
    language = piece.language;
    for (const w of piece.words) words.push({ text: w.text, startMs: Math.round(offsetMs + w.startMs), endMs: Math.round(offsetMs + w.endMs) });
    opts.onProgress?.(to / pcm.length);
    from = to;
  }
  return { words, language };
}

/** One request: the words, with the punctuation of the text put back on them. */
async function transcribe(wav: Buffer, lang: string, prompt: string): Promise<{ words: Word[]; language: string }> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "audio.wav");
  form.append("model", MODEL);
  form.append("language", lang);
  form.append("prompt", prompt);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
    if (res.ok) {
      const out = (await res.json()) as { text: string; language: string; words?: { word: string; start: number; end: number }[] };
      return { words: punctuate(out.text, out.words ?? []), language: languageCode(out.language) ?? lang };
    }
    // Rate limits and the server's own trouble pass; anything else won't.
    if ((res.status === 429 || res.status >= 500) && attempt < 4) await new Promise((r) => setTimeout(r, 2000 * attempt));
    else throw new Error(`OpenAI transcription failed (${res.status}): ${await res.text()}`);
  }
}

/**
 * The API's words come bare ("aiheesta"); its text has them as said ("aiheesta,"). Each word
 * of the text takes the times of the bare words it's made of ("Outerview-tuotteesta" may come
 * as two).
 */
function punctuate(text: string, bare: { word: string; start: number; end: number }[]): Word[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const out: Word[] = [];
  let k = 0;
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const want = norm(token);
    if (!want) continue;
    let got = "";
    const first = k;
    while (k < bare.length && got.length < want.length && want.startsWith(got + norm(bare[k].word))) got += norm(bare[k++].word);
    if (k === first) continue; // In the text but not timed: leave it out.
    out.push({ text: token, startMs: Math.round(bare[first].start * 1000), endMs: Math.round(bare[k - 1].end * 1000) });
  }
  // Timed words the text didn't account for, kept as they came.
  for (; k < bare.length; k++) out.push({ text: bare[k].word, startMs: Math.round(bare[k].start * 1000), endMs: Math.round(bare[k].end * 1000) });
  return out;
}

/** The API names the language ("finnish"); the rest of the code uses its code ("fi"). */
function languageCode(name: string | undefined): string | undefined {
  const codes: Record<string, string> = { finnish: "fi", english: "en", swedish: "sv", german: "de", french: "fr", spanish: "es" };
  return name ? (codes[name.toLowerCase()] ?? name) : undefined;
}

/** The quietest 100 ms within SNAP_S of a sample. */
function quietest(pcm: Int16Array, rate: number, around: number): number {
  const step = Math.round(rate / 10);
  let best = around;
  let bestPower = Infinity;
  for (let at = around - SNAP_S * rate; at <= around + SNAP_S * rate - step; at += step) {
    let sum = 0;
    for (let i = at; i < at + step; i++) sum += pcm[i] * pcm[i];
    if (sum < bestPower) [best, bestPower] = [at + Math.round(step / 2), sum];
  }
  return best;
}

function wavOf(pcm: Int16Array, rate: number): Buffer {
  const b = Buffer.alloc(44 + pcm.length * 2);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(36 + pcm.length * 2, 4);
  b.write("WAVEfmt ", 8, "ascii");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36, "ascii");
  b.writeUInt32LE(pcm.length * 2, 40);
  Buffer.from(pcm.buffer, pcm.byteOffset, pcm.length * 2).copy(b, 44);
  return b;
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
