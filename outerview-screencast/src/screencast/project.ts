import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { Box, Card, Word } from "../types.ts";

/** What Whisper heard, word by word. Times are ms into the recording. */
export type Transcript = {
  source: string;
  language: string;
  model: string;
  words: (Word & { confidence?: number })[];
};

/**
 * An edit of one recording, as written in projects/<name>/project.yaml. Times are
 * "mm:ss.s" strings or seconds. A zoom is an area of the recording, [x, y, width, height]
 * in its pixels, or "full" for the whole screen.
 */
export type ProjectFile = {
  source: string;
  title: Card;
  end: Card;
  music?: string;
  /** 0–1, under the voice. Default 0.12. */
  musicVolume?: number;
  /** Fix Whisper's spelling in captions: { "outer view": "Outerview" }. Case-insensitive. */
  replace?: Record<string, string>;
  clips: ClipFile[];
};

export type ZoomFile = "full" | [number, number, number, number];

export type ClipFile = {
  from: string | number;
  to: string | number;
  /** What is said in this clip. Only a note for you: captions come from the transcript. */
  say?: string;
  /** Where to look: one area for the whole clip, or a list of moves, `at` seconds into it. */
  zoom?: ZoomFile | { at: number; zoom: ZoomFile }[];
  /** Play faster, for a wait. Sound is muted when sped up. */
  speed?: number;
  /** Leave out the captions for this clip. */
  captions?: false;
};

export const projectName = (source: string) =>
  path
    .basename(source, path.extname(source))
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

export const projectDir = (name: string) => path.resolve("projects", name);

export async function loadProject(name: string): Promise<{ project: ProjectFile; transcript: Transcript }> {
  const dir = projectDir(name);
  const project = YAML.parse(await readFile(path.join(dir, "project.yaml"), "utf8")) as ProjectFile;
  const transcript = JSON.parse(await readFile(path.join(dir, "transcript.json"), "utf8")) as Transcript;
  if (!project?.clips?.length) throw new Error(`${name}/project.yaml has no clips`);
  return { project, transcript };
}

/** "01:23.4" → 83400 ms; 83.4 → 83400 ms. */
export function toMs(t: string | number): number {
  if (typeof t === "number") return Math.round(t * 1000);
  const parts = t.trim().split(":").map(Number);
  if (parts.some((p) => Number.isNaN(p))) throw new Error(`Not a time: "${t}" (use mm:ss.s)`);
  const seconds = parts.reduce((acc, p) => acc * 60 + p, 0);
  return Math.round(seconds * 1000);
}

export const toBox = (z: ZoomFile): Box | null =>
  z === "full" ? null : { x: z[0], y: z[1], width: z[2], height: z[3] };
