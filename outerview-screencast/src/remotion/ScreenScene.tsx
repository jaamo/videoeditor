import { useMemo } from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Frame, Manifest, TimelineEvent } from "../types";
import { cameraTrack, H, overviewCam, project, W, type Cam } from "./camera";
import { theme } from "./theme";

export const ScreenScene = ({ manifest: m }: { manifest: Manifest }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const { width: vw, height: vh } = m.viewport;

  const camAt = useMemo(() => cameraTrack(m.events, vw, vh), [m.events, vw, vh]);
  const cursorAt = useMemo(() => cursorTrack(m.events), [m.events]);
  const cam = camAt(ms);
  const shot = frameAt(m.frames, ms);
  // A straight cut cross-fades from the last frame before it.
  const cut = m.events.find((e) => e.type === "cut" && e.keepMs === 0 && ms >= e.t && ms < e.t + CROSSFADE_MS);
  const before = cut ? frameAt(m.frames, cut.t - 1) : undefined;
  const speedUp = m.events.find(
    (e): e is Extract<typeof e, { type: "cut" }> => e.type === "cut" && e.keepMs > 0 && ms >= e.t && ms < e.t + e.keepMs,
  );

  // Rounded corners and a shadow while the whole screen is in view, gone once it fills the frame.
  const zoomedIn = interpolate(cam.s, [overviewCam(vw, vh).s, H / vh], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {shot && (
        <div
          style={{
            position: "absolute", left: 0, top: 0, width: vw, height: vh, transformOrigin: "0 0",
            transform: `translate(${W / 2 - cam.cx * cam.s}px, ${H / 2 - cam.cy * cam.s}px) scale(${cam.s})`,
            borderRadius: 18 * (1 - zoomedIn), overflow: "hidden",
            boxShadow: `0 30px 80px rgba(59,42,34,${0.25 * (1 - zoomedIn)})`,
          }}
        >
          <Img src={staticFile(shot.file)} style={{ width: vw, height: vh, display: "block" }} />
          {cut && before && (
            <Img
              src={staticFile(before.file)}
              style={{
                position: "absolute", inset: 0, width: vw, height: vh,
                opacity: 1 - (ms - cut.t) / CROSSFADE_MS,
              }}
            />
          )}
        </div>
      )}
      {speedUp && <SpeedBadge speed={speedUp.speed} />}
      <Spotlights events={m.events} ms={ms} cam={cam} />
      <Ripples events={m.events} ms={ms} cam={cam} />
      <Cursor at={project(cam, ...cursorAt(ms))} pressed={isPressed(m.events, ms)} />
    </AbsoluteFill>
  );
};

const CROSSFADE_MS = 300;

/** Says the footage is sped up, so a fast AI reply doesn't pass for real speed. */
const SpeedBadge = ({ speed }: { speed: number }) => (
  <div
    style={{
      position: "absolute", top: 120, right: 60, padding: "14px 26px", borderRadius: 999,
      background: "rgba(17,17,17,0.8)", color: "white", fontSize: 40, fontWeight: 700,
    }}
  >
    ⏩ {Math.round(speed)}×
  </div>
);

/** The last captured frame at or before `ms`. Chrome only sends a frame when the screen changes. */
function frameAt(frames: Frame[], ms: number): Frame | undefined {
  let lo = 0;
  let hi = frames.length - 1;
  if (hi < 0) return undefined;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= ms) lo = mid;
    else hi = mid - 1;
  }
  return frames[lo];
}

const moveEase = Easing.bezier(0.45, 0, 0.2, 1);

function cursorTrack(events: TimelineEvent[]) {
  type Move = Extract<TimelineEvent, { type: "move" }> & { from: { x: number; y: number } };
  const moves: Move[] = [];
  for (const e of events) {
    if (e.type !== "move") continue;
    const prev = moves.at(-1);
    moves.push({ ...e, from: prev ? prev.to : e.to });
  }
  return (ms: number): [number, number] => {
    let m: Move | undefined;
    for (const mv of moves) if (mv.t <= ms) m = mv;
    if (!m) return moves.length ? [moves[0].to.x, moves[0].to.y] : [0, 0];
    const p = m.durationMs ? moveEase(Math.min(1, (ms - m.t) / m.durationMs)) : 1;
    return [m.from.x + (m.to.x - m.from.x) * p, m.from.y + (m.to.y - m.from.y) * p];
  };
}

const isPressed = (events: TimelineEvent[], ms: number) =>
  events.some((e) => e.type === "click" && ms >= e.t - 60 && ms < e.t + 140);

const Cursor = ({ at, pressed }: { at: { x: number; y: number }; pressed: boolean }) => (
  <svg
    width={56}
    height={56}
    viewBox="0 0 24 24"
    style={{
      position: "absolute", left: at.x - 6, top: at.y - 3, transformOrigin: "6px 3px",
      transform: `scale(${pressed ? 0.85 : 1})`, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.35))",
    }}
  >
    <path
      d="M5.5 3.2v16.1c0 .5.6.7.9.3l3.7-4.4c.2-.2.4-.3.7-.3h5.8c.5 0 .7-.6.4-.9L6.4 2.9c-.3-.3-.9-.1-.9.3z"
      fill="white"
      stroke="#111"
      strokeWidth={1.4}
      strokeLinejoin="round"
    />
  </svg>
);

const Ripples = ({ events, ms, cam }: { events: TimelineEvent[]; ms: number; cam: Cam }) => (
  <>
    {events.map((e, i) => {
      if (e.type !== "click" || ms < e.t || ms > e.t + 650) return null;
      const p = (ms - e.t) / 650;
      const r = interpolate(p, [0, 1], [10, 90], { easing: Easing.out(Easing.cubic) });
      const at = project(cam, e.at.x, e.at.y);
      return (
        <div
          key={i}
          style={{
            position: "absolute", left: at.x - r, top: at.y - r, width: r * 2, height: r * 2, borderRadius: "50%",
            border: `6px solid ${theme.red}`, background: "rgba(230,59,46,0.15)", opacity: 1 - p,
          }}
        />
      );
    })}
  </>
);

/** Dim everything except the highlighted element, and ring it in brand red. */
const Spotlights = ({ events, ms, cam }: { events: TimelineEvent[]; ms: number; cam: Cam }) => (
  <>
    {events.map((e, i) => {
      if (e.type !== "highlight" || ms < e.t || ms > e.untilMs) return null;
      const opacity = Math.min(
        interpolate(ms, [e.t + 200, e.t + 600], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        interpolate(ms, [e.untilMs - 300, e.untilMs], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      );
      const pad = 14;
      const a = project(cam, e.box.x, e.box.y);
      const b = project(cam, e.box.x + e.box.width, e.box.y + e.box.height);
      return (
        <div
          key={i}
          style={{
            position: "absolute", left: a.x - pad, top: a.y - pad, width: b.x - a.x + pad * 2, height: b.y - a.y + pad * 2,
            borderRadius: 24, border: `6px solid ${theme.red}`, opacity,
            boxShadow: "0 0 0 4000px rgba(17,17,17,0.35)",
          }}
        />
      );
    })}
  </>
);
