// Reading the footage: what's in a file, its sound and its frames as numbers.
import { spawn, spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";

/**
 * A full ffmpeg. Remotion's own is slim (few filters, no raw video out), so this is the
 * system's, or else the one inside Kdenlive's flatpak, which sees the home folder.
 */
let full: string[] | undefined;
function fullFfmpeg(): string[] {
  if (full) return full;
  if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0) return (full = ["ffmpeg"]);
  if (spawnSync("flatpak", ["info", "org.kde.kdenlive"], { stdio: "ignore" }).status === 0)
    return (full = ["flatpak", "run", "--command=ffmpeg", "org.kde.kdenlive"]);
  throw new Error("Needs a full ffmpeg: install it (sudo apt install ffmpeg), or Kdenlive's flatpak");
}

/** Run ffmpeg; with `stdout`, its output comes in pieces to it. */
export function ff(args: string[], stdout?: (chunk: Buffer) => void): Promise<void> {
  const [cmd, ...pre] = fullFfmpeg();
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, [...pre, "-hide_banner", "-nostdin", ...args], { stdio: ["ignore", stdout ? "pipe" : "ignore", "pipe"] });
    let err = "";
    p.stderr!.on("data", (c) => (err = (err + c).slice(-4000)));
    if (stdout) p.stdout!.on("data", stdout);
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${args.join(" ")}\n${err}`))));
  });
}

/** ffmpeg's report on stderr, for filters that only print (loudness, black frames, silences). */
export function ffReport(args: string[]): Promise<string> {
  const [cmd, ...pre] = fullFfmpeg();
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, [...pre, "-hide_banner", "-nostdin", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr!.on("data", (c) => (err += c));
    p.on("exit", (code) => (code === 0 ? resolve(err) : reject(new Error(`ffmpeg ${args.join(" ")}\n${err.slice(-4000)}`))));
  });
}

export type Probe = { width: number; height: number; durationMs: number; fps: number; hasAudio: boolean };

/** Size as shown (a phone's vertical video is often stored sideways, with a rotation). */
export function probe(file: string): Probe {
  const r = spawnSync("npx", ["remotion", "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`Can't read ${file}: ${r.stderr}`);
  const j = JSON.parse(r.stdout) as {
    streams: { codec_type: string; width?: number; height?: number; avg_frame_rate?: string; tags?: { rotate?: string }; side_data_list?: { rotation?: number }[] }[];
    format: { duration: string };
  };
  const v = j.streams.find((s) => s.codec_type === "video");
  if (!v) throw new Error(`No video in ${file}`);
  const rotation = Math.abs(Number(v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0)) % 180;
  const [n, d] = (v.avg_frame_rate ?? "30/1").split("/").map(Number);
  return {
    width: rotation === 90 ? v.height! : v.width!,
    height: rotation === 90 ? v.width! : v.height!,
    durationMs: Math.round(Number(j.format.duration) * 1000),
    fps: d ? n / d : 30,
    hasAudio: j.streams.some((s) => s.codec_type === "audio"),
  };
}

/** How long a file is, audio or video. */
export function durationOf(file: string): number {
  const r = spawnSync("npx", ["remotion", "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`Can't read ${file}: ${r.stderr}`);
  return Math.round(Number(r.stdout.trim()) * 1000);
}

/** A file's sound as mono 16-bit samples. */
export async function pcm(file: string, rate: number): Promise<Int16Array> {
  const parts: Buffer[] = [];
  await ff(["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", String(rate), "-f", "s16le", "-acodec", "pcm_s16le", "-"], (c) => parts.push(c));
  const b = Buffer.concat(parts);
  return new Int16Array(b.buffer, b.byteOffset, Math.floor(b.length / 2));
}

/**
 * A 16-bit WAV's loudness in dBFS every 10 ms, each over the 30 ms around it: fine enough to
 * see where a word starts, which Whisper's times can miss by a few tenths.
 */
export async function levels(wav: string): Promise<(ms: number) => number> {
  const { rate, samples } = await readWav(wav);
  const step = rate / 100;
  const power = new Float64Array(Math.floor(samples.length / step));
  for (let f = 0; f < power.length; f++) {
    let sum = 0;
    for (let i = f * step; i < (f + 1) * step; i++) sum += samples[i] * samples[i];
    power[f] = sum / step;
  }
  return (ms) => {
    const f = Math.round(ms / 10);
    let sum = 0;
    let n = 0;
    for (let k = f - 1; k <= f + 1; k++) if (k >= 0 && k < power.length) (sum += power[k]), n++;
    return n ? 10 * Math.log10(sum / n / 32768 ** 2 + 1e-12) : -120;
  };
}

/** A 16-bit WAV's samples, and its rate. */
export async function readWav(file: string): Promise<{ rate: number; samples: Int16Array }> {
  const buf = await readFile(file);
  const rate = buf.readUInt32LE(24);
  const data = buf.indexOf("data", 12, "ascii") + 8;
  return { rate, samples: new Int16Array(Buffer.from(buf.subarray(data)).buffer) };
}

/** Frames of a video, small, as RGB, `fps` a second, each to `onFrame` with its time. */
export async function frames(file: string, o: { fps: number; width: number; height: number }, onFrame: (rgb: Buffer, ms: number) => void) {
  const size = o.width * o.height * 3;
  let pending: Buffer = Buffer.alloc(0);
  let n = 0;
  await ff(["-v", "error", "-i", file, "-an", "-vf", `fps=${o.fps},scale=${o.width}:${o.height}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], (c) => {
    pending = pending.length ? Buffer.concat([pending, c]) : c;
    while (pending.length >= size) {
      onFrame(pending.subarray(0, size), Math.round((n++ / o.fps) * 1000));
      pending = pending.subarray(size);
    }
  });
}

/** One frame as a JPEG, at the video's own size unless given a width, optionally with a box drawn on it (in the video's pixels). */
export async function still(file: string, ms: number, out: string, o: { width?: number; box?: [number, number, number, number] } = {}) {
  const vf = [o.box ? `drawbox=x=${o.box[0]}:y=${o.box[1]}:w=${o.box[2]}:h=${o.box[3]}:color=0x00e5ff@0.9:t=6` : "", o.width ? `scale=${o.width}:-2` : "", "null"].filter(Boolean);
  await ff(["-v", "error", "-y", "-ss", String(ms / 1000), "-i", file, "-frames:v", "1", "-vf", vf.join(","), "-q:v", "3", out]);
}

/**
 * Grids of frames: a look at a whole video at once. Tiles go left to right, top to bottom,
 * every `everyS`; each sheet's name says the times it covers, in another clock with
 * `offsetMs` (where the file starts in it). Returns each sheet with its tiles' times.
 */
export async function contactSheets(file: string, durationMs: number, outPrefix: string, everyS: number, o: { cols?: number; rows?: number; tileWidth?: number; offsetMs?: number } = {}) {
  const { cols = 4, rows = 4, tileWidth = 480, offsetMs = 0 } = o;
  const per = cols * rows * everyS;
  const sheets: { file: string; times: number[] }[] = [];
  for (let start = 0, i = 1; start * 1000 < durationMs; start += per, i++) {
    const times = Array.from({ length: cols * rows }, (_, k) => start + k * everyS).filter((t) => t * 1000 < durationMs).map((t) => Math.round((t + offsetMs / 1000) * 10) / 10);
    const out = `${outPrefix}-${String(i).padStart(2, "0")}_${times[0]}s-${times.at(-1)}s.jpg`;
    await ff([
      "-v", "error", "-y", "-ss", String(start), "-t", String(per), "-i", file, "-an",
      "-vf", `select='isnan(prev_selected_t)+gte(t-prev_selected_t\\,${everyS - 0.001})',scale=${tileWidth}:-2,tile=${cols}x${rows}:padding=4:color=black`,
      "-fps_mode", "vfr", "-frames:v", "1", "-q:v", "4", out,
    ]);
    sheets.push({ file: out, times });
  }
  return sheets;
}

/** A content key for a file: its size and when it was written. */
export function fingerprint(file: string) {
  const s = statSync(file);
  return `${s.size}-${Math.round(s.mtimeMs)}`;
}

/** MLT's player, which Kdenlive renders with: the system's, or the one in Kdenlive's flatpak. */
export function melt(args: string[]): Promise<void> {
  const flatpak = spawnSync("melt", ["--version"], { stdio: "ignore" }).status !== 0;
  const [cmd, ...pre] = flatpak ? ["flatpak", "run", "--command=melt", "org.kde.kdenlive"] : ["melt"];
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, [...pre, ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr!.on("data", (c) => (err = (err + c).slice(-4000)));
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`melt ${args.join(" ")}\n${err}`))));
  });
}

/** One frame of a Kdenlive project, as Kdenlive draws it, to a PNG. */
export const kdenliveFrame = (project: string, frame: number, out: string) =>
  melt([project, `in=${frame}`, `out=${frame}`, "-consumer", `avformat:${out}`, "vcodec=png", "f=image2", "-quiet"]);
