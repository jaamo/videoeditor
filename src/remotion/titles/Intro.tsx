import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "./Backdrop";
import { theme, useSerif } from "./theme";

/** Each word takes this long to come in, one after another; then the whole title holds. */
export const WORD_MS = 400;
export const HOLD_MS = 3000;

export type IntroProps = { title: string };

export const introDurationMs = ({ title }: IntroProps) => title.split(" ").length * WORD_MS + HOLD_MS;

const ease = Easing.bezier(0.16, 1, 0.3, 1);

export const Intro = ({ title }: IntroProps) => {
  useSerif();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = title.split(" ");
  const wordFrames = (WORD_MS / 1000) * fps;
  const logoIn = interpolate(frame, [0, fps * 0.8], [0, 1], { extrapolateRight: "clamp", easing: ease });

  return (
    <AbsoluteFill>
      <Backdrop />
      <Img
        src={staticFile("logo-light.svg")}
        style={{ position: "absolute", top: 48, left: 56, width: 210, opacity: 0.92 * logoIn }}
      />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 160px" }}>
        <h1
          style={{
            margin: 0, textAlign: "center", color: theme.ink, fontFamily: theme.serif, fontWeight: 400,
            fontSize: 148, lineHeight: 1.05, letterSpacing: "-0.01em", textWrap: "balance",
            textShadow: "0 0 60px rgba(255,106,85,0.35)",
          }}
        >
          {words.map((w, i) => {
            const p = interpolate(frame, [i * wordFrames, (i + 1) * wordFrames], [0, 1], {
              extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease,
            });
            return (
              <span
                key={i}
                style={{
                  display: "inline-block", margin: "0 0.12em", opacity: p,
                  filter: `blur(${(1 - p) * 18}px)`,
                  transform: `translateY(${(1 - p) * 50}px) scale(${0.94 + 0.06 * p})`,
                }}
              >
                {w}
              </span>
            );
          })}
        </h1>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
