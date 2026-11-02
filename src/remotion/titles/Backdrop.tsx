import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { callBackground, theme } from "./theme";

const DUST = Array.from({ length: 70 }, (_, i) => ({
  x: random(`x${i}`) * 100,
  y: random(`y${i}`) * 100,
  r: 1 + random(`r${i}`) * 2.5,
  drift: 10 + random(`d${i}`) * 30,
  phase: random(`p${i}`) * Math.PI * 2,
}));

const RINGS = 14;

/** The red room, Maya's ring breathing behind the title, and dust floating in the light. */
export const Backdrop = ({ ring = true }: { ring?: boolean }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const ringIn = interpolate(frame, [0, fps * 1.5], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: callBackground }}>
      {ring && <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", opacity: 0.6 * ringIn }}>
        <defs>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g filter="url(#glow)" transform={`translate(${width / 2} ${height * 0.46})`}>
          {Array.from({ length: RINGS }, (_, i) => {
            const k = i / RINGS;
            const wobble = Math.sin(t * 0.7 + k * 5) * 22;
            // Each line a little off the last, so they fan out like the app's ring.
            const a = k * Math.PI * 1.3 + t * 0.25;
            return (
              <ellipse
                key={i}
                cx={Math.cos(a) * 26 * k}
                cy={Math.sin(a) * 20 * k}
                rx={410 + wobble + k * 24}
                ry={370 - wobble * 0.7 - k * 10}
                transform={`rotate(${t * 5 + k * 28})`}
                fill="none"
                stroke={theme.glow}
                strokeWidth={1.4}
                strokeOpacity={0.35 + 0.65 * (1 - k)}
              />
            );
          })}
        </g>
      </svg>}
      {DUST.map((d, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: d.r * 2,
            height: d.r * 2,
            borderRadius: "50%",
            background: theme.glow,
            opacity: (0.25 + 0.35 * Math.sin(t * 0.8 + d.phase) ** 2) * ringIn,
            transform: `translateY(${-t * d.drift}px)`,
          }}
        />
      ))}
      {/* Darken the corners, as the app does. */}
      <AbsoluteFill style={{ background: "radial-gradient(90% 90% at 50% 50%, transparent 55%, rgba(10,4,4,0.55) 100%)" }} />
    </AbsoluteFill>
  );
};
