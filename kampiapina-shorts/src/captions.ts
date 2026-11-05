// Captions: the cut's words in short lines, and captions.txt, where their text is fixed by
// hand (or by the finisher agent) without touching their timing. Pure: no Node, no DOM.
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

const s2 = (ms: number) => (ms / 1000).toFixed(2);

/** captions.txt: a header naming the cut it's for, then a line each, "[start–end] text". */
export function writeCaptions(words: Word[], cutKey: string): string {
  const lines = chunk(words);
  const body = lines.map((l, i) => {
    const end = Math.min(l.at(-1)!.endMs + LINGER_MS, lines[i + 1]?.[0].startMs ?? Infinity);
    return `[${s2(l[0].startMs)}–${s2(end)}] ${l.map((w) => w.text).join(" ")}`;
  });
  return [
    "# The captions of the cut, a line each, as [start–end] text in seconds of the cut.",
    "# Fix the text (spelling, a word misheard, where a line breaks); leave the times.",
    "# A line's words keep their own timing while their count is the same; otherwise",
    "# they're spread over the line. Delete a line to drop it.",
    `# cut: ${cutKey}`,
    ...body,
    "",
  ].join("\n");
}

/** Which cut a captions.txt was made for. */
export const cutKeyOf = (txt: string) => txt.match(/^# cut: (\S+)/m)?.[1];

/** captions.txt's lines, each word timed as said where the line still has as many words. */
export function readCaptions(txt: string, words: Word[]): Line[] {
  const out: Line[] = [];
  for (const raw of txt.split(/\r?\n/)) {
    const m = raw.match(/^\[([\d.]+)\s*[–-]\s*([\d.]+)\]\s*(.*)$/);
    if (!m) continue;
    const startMs = Math.round(Number(m[1]) * 1000);
    const endMs = Math.round(Number(m[2]) * 1000);
    const tokens = m[3].split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const said = words.filter((w) => (w.startMs + w.endMs) / 2 >= startMs - 20 && (w.startMs + w.endMs) / 2 < endMs);
    const timed =
      said.length === tokens.length
        ? tokens.map((text, i) => ({ ...said[i], text }))
        : tokens.map((text, i) => {
            const from = said[0]?.startMs ?? startMs;
            const to = said.at(-1)?.endMs ?? Math.max(from + 200, endMs - LINGER_MS);
            const step = Math.max(0, to - from) / tokens.length;
            return { text, startMs: Math.round(from + i * step), endMs: Math.round(from + (i + 1) * step) };
          });
    out.push({ endMs, words: timed });
  }
  return out;
}
