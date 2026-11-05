// Render an edited screen recording from its project file.
//   npm run cut -- <project>            → out/<project>/<project>.mp4
//   npm run cut -- <project> --studio   preview and scrub in Remotion Studio
// <project> is a folder in projects/, made by `npm run transcribe`.
import { existsSync } from "node:fs";
import { cp, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ScreencastManifest } from "../types.ts";
import { loadEdit } from "./edit.ts";
import { run } from "./run.ts";
import { isFresh } from "./voice.ts";

const FPS = 30;
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const name = args.find((a) => !a.startsWith("--"));
if (!name) throw new Error("Usage: npm run cut -- <project> [--studio]   (a folder in projects/)");

const { project, transcript, source, sourceSize, outDir, clips, screenDurationMs: at } = await loadEdit(name);

// --- public dir: the recording, voice, brand, music ------------------------------------
// A copy, not a link: Remotion copies the public folder when it bundles, and a symlink
// doesn't survive that.
const published = `source${path.extname(source)}`;
if (!isFresh(source, path.join(outDir, published))) await cp(source, path.join(outDir, published));
await cp(path.resolve("assets/brand"), path.join(outDir, "brand"), { recursive: true });
let music: string | undefined;
if (project.music) {
  if (existsSync(project.music)) {
    music = `music${path.extname(project.music)}`;
    await cp(path.resolve(project.music), path.join(outDir, music));
  } else console.log(`no music: ${project.music} not found`);
}

const manifest: ScreencastManifest = {
  fps: FPS,
  source: published,
  voice: "voice.wav",
  sourceSize,
  title: project.title,
  end: project.end,
  music,
  musicVolume: project.musicVolume ?? 0.12,
  screenDurationMs: at,
  clips,
};
const props = path.join(outDir, "manifest.json");
await writeFile(props, JSON.stringify(manifest));
const recorded = (transcript.words.at(-1)?.endMs ?? 0) / 1000;
console.log(`${clips.length} clips: ${(at / 1000).toFixed(1)}s, cut from ${recorded.toFixed(0)}s recorded`);

const remotionArgs = ["src/remotion/index.ts", `--public-dir=${outDir}`, `--props=${props}`];
if (flags.has("--studio")) {
  await run("npx", ["remotion", "studio", ...remotionArgs]);
} else {
  const mp4 = path.join(outDir, `${name}.mp4`);
  await run("npx", ["remotion", "render", remotionArgs[0], "Screencast", mp4, ...remotionArgs.slice(1), "--concurrency=50%"]);
  console.log(`\n${mp4}`);
}
