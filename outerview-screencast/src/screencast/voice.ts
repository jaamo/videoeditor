import { existsSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { ffmpeg } from "./whisper.ts";

const RATE = 48_000;
const LIMIT = 32_767;

/**
 * The recording's voice as a clean mono WAV. Some recordings carry a large DC offset (the
 * wave sits far off zero), which thumps wherever the sound is cut or faded, and pushes the
 * peaks on one side into clipping. This takes the channel that clips least, removes the
 * offset, and brings the level up to a steady peak. Made once per recording.
 */
export async function cleanVoice(source: string, out: string): Promise<{ channel: "left" | "right" }> {
  const wav: Buffer[] = [];
  await ffmpeg(["-v", "error", "-i", source, "-vn", "-ac", "2", "-ar", String(RATE), "-f", "wav", "-acodec", "pcm_s16le", "-"], (c) => wav.push(c));
  const buf = Buffer.concat(wav);
  const data = buf.indexOf("data", 12, "ascii");
  if (data < 0) throw new Error(`No audio in ${source}`);
  const pcm = new Int16Array(Buffer.from(buf.subarray(data + 8)).buffer);
  const frames = Math.floor(pcm.length / 2);

  // The channel with fewer samples stuck at the limits has the less damaged voice.
  let clipL = 0;
  let clipR = 0;
  for (let i = 0; i < frames; i++) {
    if (Math.abs(pcm[2 * i]) >= LIMIT) clipL++;
    if (Math.abs(pcm[2 * i + 1]) >= LIMIT) clipR++;
  }
  const ch = clipL <= clipR ? 0 : 1;

  // DC blocker: a one-pole high-pass at a few Hz. Removes the offset, keeps the voice.
  const y = new Float32Array(frames);
  let prevX = pcm[ch];
  let prevY = 0;
  for (let i = 0; i < frames; i++) {
    const x = pcm[2 * i + ch];
    prevY = x - prevX + 0.9995 * prevY;
    prevX = x;
    y[i] = prevY;
  }

  // Level: the loudest speech (99.9th percentile, so a stray pop doesn't decide) to -3 dBFS.
  const sample = Array.from({ length: Math.min(frames, 200_000) }, (_, k) => Math.abs(y[Math.floor((k * frames) / Math.min(frames, 200_000))]));
  sample.sort((a, b) => a - b);
  const peak = sample[Math.floor(sample.length * 0.999)] || 1;
  const gain = Math.min(8, (LIMIT * 0.7) / peak);

  const out16 = Buffer.alloc(44 + frames * 2);
  writeWavHeader(out16, frames);
  for (let i = 0; i < frames; i++) out16.writeInt16LE(Math.max(-LIMIT, Math.min(LIMIT, Math.round(y[i] * gain))), 44 + i * 2);
  await writeFile(out, out16);
  return { channel: ch === 0 ? "left" : "right" };
}

/** Whether `out` is already made from the current `source`. */
export const isFresh = (source: string, out: string) => existsSync(out) && statSync(out).mtimeMs > statSync(source).mtimeMs;

function writeWavHeader(b: Buffer, frames: number) {
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(36 + frames * 2, 4);
  b.write("WAVEfmt ", 8, "ascii");
  b.writeUInt32LE(16, 16); // fmt chunk size
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36, "ascii");
  b.writeUInt32LE(frames * 2, 40);
}
