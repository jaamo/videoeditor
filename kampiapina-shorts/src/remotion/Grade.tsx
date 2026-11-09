import { AbsoluteFill, useCurrentFrame } from "remotion";

const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const table = (from: number[], to: number[], k: number) => from.map((v, i) => mix(v, to[i], k).toFixed(4)).join(" ");
const IDENTITY = [0, 0.25, 0.5, 0.75, 1];

/**
 * The look: warm and faded, like an old print. Colours a little washed out, a warm cast, the
 * blacks lifted to a warm brown and the whites held back, a soft vignette and a fine grain.
 * `strength` 0 leaves the picture as it is; 1 is the full look (still a slight one).
 */
export const Grade = ({ strength: k, flat: f = 0, children }: { strength: number; flat?: number; children: React.ReactNode }) => {
  const frame = useCurrentFrame();
  if (k <= 0 && f <= 0) return <AbsoluteFill>{children}</AbsoluteFill>;
  // Flat, like unprocessed log footage: less colour, the blacks lifted to grey, the whites held
  // down, so the contrast drops. `flat` 0 none, 1 very flat.
  const lift = 0.16 * f;
  const top = 1 - 0.08 * f;
  // Tone curves per channel: lifted, warm shadows (red up, blue down), slightly rolled-off highlights.
  const r = table(IDENTITY, [0.075, 0.29, 0.54, 0.79, 0.97], k);
  const g = table(IDENTITY, [0.055, 0.265, 0.505, 0.75, 0.95], k);
  const b = table(IDENTITY, [0.04, 0.225, 0.45, 0.69, 0.88], k);
  // A warm cast on top of the curves: a touch of red into green, less blue.
  const warm = [
    mix(1, 1.04, k), mix(0, 0.03, k), 0, 0, 0,
    mix(0, 0.02, k), mix(1, 1.0, k), 0, 0, 0,
    0, mix(0, 0.02, k), mix(1, 0.92, k), 0, 0,
    0, 0, 0, 1, 0,
  ].join(" ");
  return (
    <AbsoluteFill>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <filter id="kp-grade" colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
          <feColorMatrix type="saturate" values={String(mix(1, 0.72, k) * mix(1, 0.55, f))} />
          <feColorMatrix type="matrix" values={warm} />
          <feComponentTransfer>
            <feFuncR type="table" tableValues={r} />
            <feFuncG type="table" tableValues={g} />
            <feFuncB type="table" tableValues={b} />
          </feComponentTransfer>
          <feComponentTransfer>
            <feFuncR type="linear" slope={top - lift} intercept={lift} />
            <feFuncG type="linear" slope={top - lift} intercept={lift} />
            <feFuncB type="linear" slope={top - lift} intercept={lift} />
          </feComponentTransfer>
        </filter>
        <filter id="kp-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frame % 97} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </svg>
      <AbsoluteFill style={{ filter: "url(#kp-grade)" }}>{children}</AbsoluteFill>
      <AbsoluteFill
        style={{ background: `radial-gradient(ellipse 80% 62% at 50% 44%, rgba(0,0,0,0) 58%, rgba(28,14,6,${(0.42 * k).toFixed(3)}) 100%)`, pointerEvents: "none" }}
      />
      <AbsoluteFill style={{ opacity: 0.06 * k, mixBlendMode: "overlay", pointerEvents: "none" }}>
        <svg width="100%" height="100%">
          <rect width="100%" height="100%" filter="url(#kp-grain)" />
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
