import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { ManifestStep, Word } from "../types";

const MAX_WORDS = 4;
const MAX_CHARS = 24;
/** Keep the last line up briefly after the voice stops. */
export const LINGER_MS = 500;

/**
 * Burned-in captions, a few words at a time, with the word being said picked out. Placed for
 * a vertical video unless told otherwise.
 */
export const Captions = ({
  steps, lines, top = 1390, fontSize = 66, maxWidth = 940,
}: {
  steps: Pick<ManifestStep, "startMs" | "endMs" | "words">[];
  /** Lines made by hand, shown until their end, instead of the steps' words cut into lines. */
  lines?: { endMs: number; words: Word[] }[];
  top?: number; fontSize?: number; maxWidth?: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;

  const step = steps.find((s) => ms >= s.startMs && ms < s.endMs);
  if (!step || !step.words.length) return null;
  const local = ms - step.startMs;
  const chunks = lines ?? chunk(step.words).map((words) => ({ endMs: words.at(-1)!.endMs + LINGER_MS, words }));
  const ci = chunks.findLastIndex((c) => c.words[0].startMs <= local);
  if (ci < 0) return null;
  const { words, endMs } = chunks[ci];
  if (local > endMs) return null;

  const shownAtFrame = Math.round(((step.startMs + words[0].startMs) / 1000) * fps);
  const pop = spring({ frame: frame - shownAtFrame, fps, config: { damping: 14, stiffness: 220 } });

  return (
    <AbsoluteFill style={{ alignItems: "center", pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute", top, maxWidth, padding: "22px 40px", borderRadius: 28,
          background: "rgba(17,17,17,0.86)", textAlign: "center",
          fontSize, fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.01em",
          transform: `scale(${0.85 + 0.15 * pop})`, opacity: pop,
        }}
      >
        {words.map((w, i) => {
          const spoken = w.startMs <= local;
          const current = spoken && (words[i + 1]?.startMs ?? Infinity) > local;
          return (
            <span key={i} style={{ color: current ? "#FFB49E" : spoken ? "white" : "rgba(255,255,255,0.55)" }}>
              {w.text}
              {i < words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Group words into short lines, breaking after punctuation where it can. */
export function chunk(words: Word[]): Word[][] {
  const out: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    const len = cur.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length;
    if (cur.length && (cur.length >= MAX_WORDS || len > MAX_CHARS)) {
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

