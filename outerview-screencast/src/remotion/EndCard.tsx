import { AbsoluteFill, Img, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Card } from "../types";
import { theme, warmBackground } from "./theme";

export const EndCard = ({ headline, sub, url }: Card) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = (delay: number) => spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 120 } });
  const rise = (delay: number) => ({ opacity: pop(delay), transform: `translateY(${(1 - pop(delay)) * 40}px)` });

  return (
    <AbsoluteFill style={{ background: warmBackground, alignItems: "center", justifyContent: "center", gap: 56 }}>
      <Img src={staticFile("brand/logo.png")} style={{ width: 520, ...rise(4) }} />
      <div style={{ textAlign: "center", ...rise(10) }}>
        <div style={{ fontSize: 96, fontWeight: 650, letterSpacing: "-0.03em", color: theme.ink, lineHeight: 1.05 }}>
          {headline}
        </div>
        {sub && <div style={{ fontSize: 96, fontWeight: 650, letterSpacing: "-0.03em", color: theme.red }}>{sub}</div>}
      </div>
      {url && (
        <div
          style={{
            ...rise(18), marginTop: 24, padding: "26px 56px", borderRadius: 999, background: theme.red, color: "white",
            fontSize: 48, fontWeight: 600, boxShadow: "0 18px 40px rgba(230,59,46,0.3)",
          }}
        >
          {url}
        </div>
      )}
    </AbsoluteFill>
  );
};
