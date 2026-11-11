import type { Key } from "./keys";

/** A word as said: its text and when, in ms. */
export type Word = { text: string; startMs: number; endMs: number };

/** A caption line: its words, shown from `startMs` (or its first word) until `endMs`. */
export type Line = { startMs?: number; endMs: number; words: Word[] };

/**
 * Props of the Short composition: the cut as it is in Kdenlive, finished. Picture and sound
 * are in frames of the cut (Kdenlive's own unit); captions in ms of it.
 */
export type ShortManifest = {
  fps: number;
  width: number;
  height: number;
  durationFrames: number;
  /** Every file the cut uses, published under `src`, with its size as shown. */
  sources: { src: string; width: number; height: number; image?: boolean }[];
  /** Video tracks, bottom to top. A clip's keys are its Transform, in frames from its start. */
  tracks: {
    keys?: Key[];
    clips: { source: number; atF: number; durF: number; fromF: number; speed: number; keys: Key[]; blur?: number; brightness?: number }[];
  }[];
  /** Sound: pieces of files, each with its fades (frames) and level. */
  audio: { src: string; atF: number; durF: number; fromF: number; fadeInF: number; fadeOutF: number; gain: number }[];
  /** Captions. */
  lines: Line[];
  music?: string;
  musicVolume: number;
  /** The look: 0 none, 1 the full warm, faded retro grade. */
  grade: number;
  /** Flat, log-like: lifted blacks, less contrast and colour. 0 none, 1 very flat. */
  flat?: number;
  /** Brighter midtones (a gamma lift, whites and blacks stay put). 0 none, 1 much brighter. */
  bright?: number;
};
