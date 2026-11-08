// Captions: the cut's words in short lines, as Kdenlive's subtitles, where the user fixes their
// text and timing; read back for the render, which draws them. Pure: no Node, no DOM.
import type { Line, Word } from "./types";

/** A Short's line: a few big words. */
const MAX_WORDS = 3;
const MAX_CHARS = 18;
/** Keep a line up this long after its last word, unless the next comes first. */
export const LINGER_MS = 400;

/** Group words into short lines, breaking after punctuation where it can. */
export function chunk(words: Word[]): Word[][] {
  const out: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    const len = cur.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length;
    // A long pause starts a new line too.
    if (cur.length && (cur.length >= MAX_WORDS || len > MAX_CHARS || w.startMs - cur.at(-1)!.endMs > 600)) {
      out.push(cur);
      cur = [];
    }
    cur.push(w);
    if (/[.,!?;:]$/.test(w.text)) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

/** A caption as Kdenlive's subtitles hold it: its text, shown from start to end (ms of the cut). */
export type Caption = { startMs: number; endMs: number; text: string };

/** The cut's words as caption lines, each up until the next starts (or a little after its last word). */
export function captionLines(words: Word[]): Caption[] {
  const lines = chunk(words);
  return lines.map((l, i) => ({
    startMs: l[0].startMs,
    endMs: Math.min(l.at(-1)!.endMs + LINGER_MS, lines[i + 1]?.[0].startMs ?? Infinity),
    text: l.map((w) => w.text).join(" "),
  }));
}

const assTime = (ms: number) => {
  const cs = Math.round(ms / 10);
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};

/**
 * Kdenlive's subtitles (<name>.kdenlive.ass): for seeing and fixing the captions in Kdenlive
 * only. The video's captions are drawn by the render, in their own style, from their text and
 * times. Here they're placed about where the render puts them: white, bold, from 1210 px down.
 */
export function writeAss(captions: Caption[], width: number, height: number): string {
  return [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${width}`, `PlayResY: ${height}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Default,Sans,82,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,2,8,70,70,1210,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...captions.map((c) => `Dialogue: 0,${assTime(c.startMs)},${assTime(c.endMs)},Default,,0,0,0,,${c.text}`),
    "",
  ].join("\n");
}

/** The captions in Kdenlive's subtitles file, as they are after editing there. */
export function readAss(txt: string): Caption[] {
  const ms = (c: string) => {
    const [h, m, sec] = c.trim().split(":").map(Number);
    return Math.round(((h * 60 + m) * 60 + sec) * 1000);
  };
  const out: Caption[] = [];
  for (const line of txt.split(/\r?\n/)) {
    if (!line.startsWith("Dialogue:")) continue;
    const f = line.slice("Dialogue:".length).split(",");
    // Kdenlive's styling ({\b1}…) and line breaks (\N) aren't the render's: plain words.
    const text = f.slice(9).join(",").replace(/\{[^}]*\}/g, "").replace(/\\[Nnh]/g, " ").trim();
    if (text) out.push({ startMs: ms(f[1]), endMs: ms(f[2]), text });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/**
 * Captions with their words timed as said (from a transcript of the cut), so the render can
 * light up the word being said: a line keeps the words' own times while it has as many words
 * as were said in it; otherwise its words are spread over what's said in it.
 */
export function timeCaptions(captions: Caption[], words: Word[]): Line[] {
  return captions.map(({ startMs, endMs, text }) => {
    const tokens = text.split(/\s+/).filter(Boolean);
    const said = words.filter((w) => (w.startMs + w.endMs) / 2 >= startMs - 20 && (w.startMs + w.endMs) / 2 < endMs);
    const timed =
      said.length === tokens.length
        ? tokens.map((t, i) => ({ ...said[i], text: t, startMs: Math.max(said[i].startMs, startMs) }))
        : tokens.map((t, i) => {
            const from = Math.max(startMs, said[0]?.startMs ?? startMs);
            const to = Math.min(endMs, said.at(-1)?.endMs ?? Math.max(from + 200, endMs - LINGER_MS));
            const step = Math.max(0, to - from) / tokens.length;
            return { text: t, startMs: Math.round(from + i * step), endMs: Math.round(from + (i + 1) * step) };
          });
    return { startMs, endMs, words: timed };
  });
}

/** captions.txt of projects made before the subtitles were in Kdenlive: "[start–end] text" a line. */
export function readCaptionsTxt(txt: string): Caption[] {
  const out: Caption[] = [];
  for (const raw of txt.split(/\r?\n/)) {
    const m = raw.match(/^\[([\d.]+)\s*[–-]\s*([\d.]+)\]\s*(.*)$/);
    if (m && m[3].trim()) out.push({ startMs: Math.round(Number(m[1]) * 1000), endMs: Math.round(Number(m[2]) * 1000), text: m[3].trim() });
  }
  return out;
}
