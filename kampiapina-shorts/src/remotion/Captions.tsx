import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Line } from "../types";
import { theme } from "./theme";

/**
 * Burned-in captions for a Short: a few big white words at a time, low in the middle (clear
 * of the app's buttons at the bottom), the word being said on a block of the brand red.
 */
export const Captions = ({ lines, top = 1210, fontSize = 82 }: { lines: Line[]; top?: number; fontSize?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const li = lines.findLastIndex((l) => l.words[0] && l.words[0].startMs <= ms);
  if (li < 0) return null;
  const { words, endMs } = lines[li];
  if (ms > endMs) return null;
  const pop = spring({ frame: frame - Math.round((words[0].startMs / 1000) * fps), fps, config: { damping: 15, stiffness: 260 } });
  const current = words.findLastIndex((w) => w.startMs <= ms);

  return (
    <AbsoluteFill style={{ alignItems: "center", pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute", top, width: 940, textAlign: "center",
          fontFamily: theme.font, fontSize, fontWeight: 800, lineHeight: 1.18, letterSpacing: "-0.01em",
          color: theme.white, transform: `scale(${0.88 + 0.12 * pop})`, opacity: Math.min(1, pop * 1.4),
        }}
      >
        {words.map((w, i) => {
          const on = i === current && ms <= w.endMs + 250;
          return (
            <span key={i}>
              <span
                style={{
                  display: "inline-block", padding: "0 0.14em", margin: "0.04em 0", borderRadius: "0.16em",
                  background: on ? theme.red : "transparent",
                  // An outline and a soft shadow, so white reads on any picture; none on the red block.
                  WebkitTextStroke: on ? "0" : "0.11em rgba(0,0,0,0.85)", paintOrder: "stroke fill",
                  textShadow: on ? "none" : "0 0.05em 0.25em rgba(0,0,0,0.55)",
                  boxShadow: on ? "0 0.06em 0.3em rgba(0,0,0,0.35)" : "none",
                  transform: on ? "scale(1.06)" : "none",
                }}
              >
                {w.text}
              </span>
              {i < words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
