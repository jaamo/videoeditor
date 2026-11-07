// The voice, made even: a little rumble and noise cut, compressed gently, brought to -16 LUFS.
// Only for analysis (silences, levels): Resolve plays the camera's own sound.
import { existsSync } from "node:fs";
import { rename } from "node:fs/promises";
import { ff, ffReport } from "./media.ts";

const SHAPE = "highpass=f=80,afftdn=nr=12:nf=-40,acompressor=threshold=-21dB:ratio=3:attack=5:release=120:makeup=2";
const LOUDNESS = "I=-16:TP=-1.5:LRA=11";

/** `source`'s voice, mastered, as a mono 48 kHz 16-bit WAV at `out`. */
export async function makeVoice(source: string, out: string, log: (s: string) => void) {
  const raw = out.replace(/\.wav$/, ".raw.wav");
  if (!existsSync(raw)) await ff(["-v", "error", "-y", "-i", source, "-vn", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", raw]);
  log("voice: mastering");
  // Loudness in two passes: measured, then one gain for all of it (linear), so a quiet
  // stretch isn't pumped up to speech level the way one pass's moving gain does.
  const measured = await ffReport(["-i", raw, "-af", `${SHAPE},loudnorm=${LOUDNESS}:print_format=json`, "-f", "null", "-"]);
  const m = JSON.parse(measured.slice(measured.lastIndexOf("{"), measured.lastIndexOf("}") + 1)) as Record<string, string>;
  const loudnorm = `loudnorm=${LOUDNESS}:linear=true:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}`;
  const tmp = `${out}.part.wav`;
  await ff(["-v", "error", "-y", "-i", raw, "-af", `${SHAPE},${loudnorm},aresample=48000`, "-ac", "1", "-c:a", "pcm_s16le", tmp]);
  await rename(tmp, out);
}
