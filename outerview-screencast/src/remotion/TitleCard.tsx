import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Card } from "../types";
import { FADE_MS, theme } from "./theme";

export const TitleCard = ({ headline, sub, durationMs }: Card & { durationMs: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = headline.split(" ");
  // Fade out over the last FADE_MS, into the screen scene's identical background.
  const out = interpolate(frame, [((durationMs - FADE_MS) / 1000) * fps, (durationMs / 1000) * fps], [1, 0], {
    extrapolateLeft: "clamp",
  });
  const logoIn = spring({ frame, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 90, opacity: out }}>
      <Img
        src={staticFile("brand/logo.png")}
        style={{ position: "absolute", top: 260, width: 300, opacity: logoIn }}
      />
      <h1
        style={{
          margin: 0, textAlign: "center", color: theme.ink, fontSize: 112, lineHeight: 1.05,
          fontWeight: 650, letterSpacing: "-0.03em",
        }}
      >
        {words.map((w, i) => {
          const p = spring({ frame: frame - 4 - i * 3, fps, config: { damping: 18, stiffness: 140 } });
          return (
            <span
              key={i}
              style={{
                display: "inline-block", marginRight: "0.25em", opacity: p,
                transform: `translateY(${(1 - p) * 60}px)`,
              }}
            >
              {w}
            </span>
          );
        })}
      </h1>
      {sub && (
        <div
          style={{
            marginTop: 48, fontSize: 44, fontWeight: 500, color: theme.red,
            opacity: spring({ frame: frame - 18, fps, config: { damping: 200 } }),
          }}
        >
          {sub}
        </div>
      )}
    </AbsoluteFill>
  );
};
