import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pronounce } from "../pronounce.ts";
import type { Word } from "./types.ts";

const CACHE_DIR = path.resolve("cache/tts");

/** `speechEndMs`: play the clip only this far; unset plays it all. */
export type Narration = { mp3: Buffer; words: Word[]; durationMs: number; speechEndMs?: number };

type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

/**
 * Text to speech with per-character timings. Cached on disk by everything that changes
 * the output, so re-running a video costs no credits until its narration changes.
 * `previous`/`next` are the neighbouring lines: ElevenLabs uses them for intonation, so a
 * script split into steps still sounds like one read. `force` regenerates a cached line.
 */
export async function narrate(
  text: string,
  ctx: { lang?: string; model?: string; previous?: string; next?: string; force?: boolean } = {},
): Promise<Narration> {
  const apiKey = need("ELEVENLABS_API_KEY");
  const voiceId = need("ELEVENLABS_VOICE_ID");
  const modelId = ctx.model || process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
  // v3 performs audio tags like [laughs] but doesn't take neighbouring lines.
  const isV3 = modelId.startsWith("eleven_v3");

  const lang = ctx.lang ?? "en";
  const body = {
    text: respell(text, lang),
    model_id: modelId,
    // Multilingual v2 reads the language from the text itself; the newer models also take
    // it as a code, which stops a short line from being read in the wrong one.
    language_code: /v2_5|v3|v4/.test(modelId) ? ctx.lang : undefined,
    previous_text: isV3 ? undefined : ctx.previous && respell(ctx.previous, lang),
    next_text: isV3 ? undefined : ctx.next && respell(ctx.next, lang),
    voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0, use_speaker_boost: true },
  };
  const key = createHash("sha256").update(JSON.stringify({ voiceId, ...body })).digest("hex").slice(0, 24);
  const mp3Path = path.join(CACHE_DIR, `${key}.mp3`);
  const jsonPath = path.join(CACHE_DIR, `${key}.json`);

  if (ctx.force || !existsSync(mp3Path) || !existsSync(jsonPath)) {
    const res = await request(apiKey, voiceId, body);
    const data = (await res.json()) as { audio_base64: string; alignment: Alignment };
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(mp3Path, Buffer.from(data.audio_base64, "base64"));
    await writeFile(jsonPath, JSON.stringify(data.alignment));
    console.log(`  tts: generated "${body.text.slice(0, 50)}${body.text.length > 50 ? "…" : ""}"`);
  }

  const alignment = JSON.parse(await readFile(jsonPath, "utf8")) as Alignment;
  const words = captionWords(toWords(alignment), text);
  const lastEnd = alignment.character_end_times_seconds.at(-1) ?? 0;
  return { mp3: await readFile(mp3Path), words, durationMs: Math.round(lastEnd * 1000) + 100 };
}

/**
 * Swap words for how they should be said, from pronounce.ts. A rule matches the start of a
 * word and keeps the rest, so "Outerviewissä" becomes "Autervjuuissä"; where an inflected
 * form needs its own spelling, give it a rule of its own; the longest match wins.
 */
export function respell(text: string, lang: string): string {
  const rules = Object.entries(pronounce[lang] ?? {}).sort((a, b) => b[0].length - a[0].length);
  if (!rules.length) return text;
  return text.replace(/[\p{L}\p{N}'’-]+/gu, (word) => {
    for (const [from, to] of rules) {
      if (/\s/.test(to)) throw new Error(`pronounce.ts: "${to}" must be one word, so captions can follow it`);
      if (word.startsWith(from)) return to + word.slice(from.length);
    }
    return word;
  });
}

/**
 * Timings come for the respelled text; captions should show what the script says. A
 * respelling is always one word for one word, so words line up by position. Audio tags
 * ("[laughs]", "[clears throat]") are performed, not said, so they leave the captions.
 */
function captionWords(spoken: Word[], text: string): Word[] {
  const written = text.replace(TAG, " ").split(/\s+/).filter(Boolean);
  const said = dropTags(spoken);
  if (written.length !== said.length) return said;
  return said.map((w, i) => ({ ...w, text: written[i] }));
}

const TAG = /\[[^\]]*\]/g;

/** Remove the words of audio tags, which may span several: "[clears", "throat]". */
function dropTags(words: Word[]): Word[] {
  let inTag = false;
  return words.flatMap((w) => {
    let text = "";
    for (const ch of w.text) {
      if (ch === "[") inTag = true;
      else if (ch === "]") inTag = false;
      else if (!inTag) text += ch;
    }
    return text ? [{ ...w, text }] : [];
  });
}

/** POST with a few retries on 429, which also covers another job using the same key. */
async function request(apiKey: string, voiceId: string, body: object): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`,
      { method: "POST", headers: { "xi-api-key": apiKey, "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    if (res.ok) return res;
    if (res.status === 429 && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  }
}

/** Collapse character timings into words, keeping punctuation attached to its word. */
function toWords(a: Alignment): Word[] {
  const words: Word[] = [];
  let cur: Word | null = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      cur = null;
      return;
    }
    const start = Math.round(a.character_start_times_seconds[i] * 1000);
    const end = Math.round(a.character_end_times_seconds[i] * 1000);
    if (!cur) {
      cur = { text: ch, startMs: start, endMs: end };
      words.push(cur);
    } else {
      cur.text += ch;
      cur.endMs = end;
    }
  });
  return words;
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Add it to .env`);
  return v;
}
