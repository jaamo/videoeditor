import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "./Backdrop";
import { Ribbon } from "./Ribbon";
import { useSerif } from "./theme";

/** The ribbon forms this many times faster than on the call screen (five seconds there). */
const ENTRANCE = 5;
/** In: the ribbon forms (5 s / ENTRANCE). Then it holds, then switches off like an old TV. */
const IN_MS = 5000 / ENTRANCE;
const HOLD_MS = 1000;
// The line is out 1.4 s into it; a beat of black after, not more.
const OUT_MS = 1600;
export const END_MS = IN_MS + HOLD_MS + OUT_MS;

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const squeezeEase = Easing.bezier(0.7, 0, 0.84, 0);
/** The ribbon's width on screen, about: where the line it collapses into starts from. */
const RING_PX = 780;

/** Maya's ribbon forming in the red room, the logo coming up inside it (with a line under it), then a TV switch-off. */
export const End = ({ line }: { line?: string }) => {
  useSerif();
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const logoIn = interpolate(frame, [fps * 0.3, fps * 0.9], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

  // The switch-off, in seconds since it began
  const t = (frame - ((IN_MS + HOLD_MS) / 1000) * fps) / fps;
  const at = (from: number, to: number, e = (x: number) => x) =>
    interpolate(t, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });
  // The ring is squashed flat into a line, stretching out to the screen's edges as it goes
  const squeeze = at(0, 0.6, squeezeEase);
  const stretch = at(0.2, 0.7, ease);
  const backdrop = 1 - at(0.3, 0.9);
  // The line burns in as the ring is lost in it, then shrinks to a point in the middle and goes out
  const lineOn = at(0.35, 0.6);
  const lineShrink = at(0.9, 1.4, Easing.in(Easing.cubic));
  const lineOff = at(1.15, 1.4);
  // The logo (and its line) go first, in the last half second of the hold, before the ring collapses.
  const logoOut = 1 - at(-0.5, 0, ease);

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ opacity: backdrop }}>
        <Backdrop ring={false} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          transform: `scale(${1 + (width / RING_PX - 1) * stretch}, ${1 - 0.996 * squeeze})`,
          opacity: 1 - lineOn,
          filter: `brightness(${1 + 1.5 * squeeze})`,
        }}
      >
        <Ribbon entrance={ENTRANCE} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            position: "absolute", height: 3, borderRadius: 2,
            width: (RING_PX + (width - RING_PX) * stretch) * (1 - lineShrink) + 4,
            background: "#FFF4EE",
            boxShadow: "0 0 12px 3px rgba(255,140,110,0.9), 0 0 50px 12px rgba(230,59,46,0.6)",
            opacity: lineOn * (1 - lineOff),
          }}
        />
        <Img
          src={staticFile("logo-light.svg")}
          style={{
            width: 440, opacity: logoIn * logoOut,
            filter: `blur(${(1 - logoIn) * 12}px) drop-shadow(0 0 30px rgba(255,106,85,${0.45 * backdrop}))`,
            transform: `scale(${0.94 + 0.06 * logoIn})`,
          }}
        />
        {line && (
          <div
            style={{
              position: "absolute", top: "50%", marginTop: 140, color: "#FFF4EE", fontFamily: "'Outerview Serif', Georgia, serif",
              fontStyle: "italic", fontSize: 44, opacity: 0.9 * logoIn * logoOut,
            }}
          >
            {line}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
