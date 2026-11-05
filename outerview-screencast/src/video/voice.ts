// The voice, made clean and even: ElevenLabs takes out noise and the room, then it's mastered.
import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { durationOf, ff, ffReport } from "./media.ts";

const rel = (f: string) => path.relative(process.cwd(), f);

/** ElevenLabs' Voice Isolator takes up to an hour, 500 MB. */
const MAX_MS = 60 * 60 * 1000;

/** Speech for a video: a little rumble (and any DC offset) cut, compressed gently so quiet words carry. */
const SHAPE = "highpass=f=80,acompressor=threshold=-21dB:ratio=3:attack=5:release=120:makeup=2";
/** Then brought to -16 LUFS (what YouTube and podcasts aim at). */
const LOUDNESS = "I=-16:TP=-1.5:LRA=11";

/** The voice is ElevenLabs' clean take, not only the local filters. */
export const isIsolated = (out: string) => existsSync(out.replace(/\.wav$/, ".isolated.wav"));
/** ElevenLabs refused before (a key without the permission, no credits): not asked again until this goes. */
export const refusedFile = (out: string) => out.replace(/\.wav$/, ".refused.txt");

class RefusedError extends Error {}

/**
 * `source`'s voice, isolated by ElevenLabs (when there's a key) and mastered, to `out`. The
 * isolated take is kept beside it, so mastering again doesn't pay again.
 */
/** `isolate: false`: only mastered (for sound that must keep other voices, like an app speaking). */
export async function makeVoice(source: string, out: string, log: (s: string) => void, o: { isolate?: boolean } = {}) {
  const isolated = out.replace(/\.wav$/, ".isolated.wav");
  const raw = out.replace(/\.wav$/, ".raw.wav");
  if (!existsSync(raw)) await ff(["-v", "error", "-y", "-i", source, "-vn", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", raw]);

  let clean = raw;
  if (existsSync(isolated)) clean = isolated;
  else if (o.isolate === false) {}
  else if (existsSync(refusedFile(out))) log(`voice: ElevenLabs refused before (${rel(refusedFile(out))}; delete it to try again): only mastered`);
  else if (process.env.ELEVENLABS_API_KEY) {
    const durationMs = durationOf(raw);
    if (durationMs > MAX_MS) log("voice: over an hour, too long for ElevenLabs: only mastered");
    else {
      log(`voice: isolating with ElevenLabs (${(durationMs / 60000).toFixed(1)} min, about ${Math.ceil(durationMs / 60000) * 1000} credits)`);
      try {
        await isolate(raw, isolated, durationMs);
        clean = isolated;
      } catch (e) {
        // A key without the permission, or out of credits: the video can still be made.
        if (!(e instanceof RefusedError)) throw e;
        await writeFile(refusedFile(out), `${new Date().toISOString()}\n${e.message}\n`);
        log(`voice: WARNING, ElevenLabs refused (${e.message}). Only mastered, with a noise filter. Once the key works, delete ${rel(refusedFile(out))} and analyze again.`);
      }
    }
  } else log("voice: no ELEVENLABS_API_KEY, so not isolated: only mastered (with a noise filter)");

  log("voice: mastering");
  const shape = clean === raw ? `${SHAPE.replace("highpass=f=80", "highpass=f=80,afftdn=nr=12:nf=-40")}` : SHAPE;
  // Loudness in two passes: measured, then one gain for all of it (linear), so a quiet
  // stretch isn't pumped up to speech level the way one pass's moving gain does.
  const measured = await ffReport(["-i", clean, "-af", `${shape},loudnorm=${LOUDNESS}:print_format=json`, "-f", "null", "-"]);
  const m = JSON.parse(measured.slice(measured.lastIndexOf("{"), measured.lastIndexOf("}") + 1)) as Record<string, string>;
  const loudnorm = `loudnorm=${LOUDNESS}:linear=true:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}`;
  const tmp = `${out}.part.wav`;
  await ff(["-v", "error", "-y", "-i", clean, "-af", `${shape},${loudnorm},aresample=48000`, "-ac", "1", "-c:a", "pcm_s16le", tmp]);
  await rename(tmp, out);
}

async function isolate(wav: string, out: string, durationMs: number) {
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(await readFile(wav))], { type: "audio/wav" }), "voice.wav");
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.elevenlabs.io/v1/audio-isolation", {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
      body: form,
    });
    if (res.ok) {
      // It answers in a format of its own choosing (MP3, as of writing): made a WAV here.
      const got = `${out}.download`;
      await writeFile(got, Buffer.from(await res.arrayBuffer()));
      await ff(["-v", "error", "-y", "-i", got, "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", `${out}.part.wav`]);
      const { rm } = await import("node:fs/promises");
      await rm(got);
      // Isolating must not move the voice in time: everything is timed by the original.
      const drift = durationOf(`${out}.part.wav`) - durationMs;
      if (Math.abs(drift) > 100) throw new Error(`ElevenLabs gave back ${drift} ms more or less than it was sent`);
      await rename(`${out}.part.wav`, out);
      return;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) await new Promise((r) => setTimeout(r, 3000 * attempt));
    else if (res.status === 401 || res.status === 402 || res.status === 403) {
      const body = await res.text();
      throw new RefusedError(JSON.parse(body)?.detail?.message ?? body);
    } else throw new Error(`ElevenLabs voice isolation failed (${res.status}): ${await res.text()}`);
  }
}
