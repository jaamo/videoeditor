import { AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { EditManifest } from "../types";
import { Captions } from "./Captions";
import { clamp, lerp } from "./camera";
import { DuckedMusic, Fade, useBrandFont } from "./shared";
import { FADE_MS, theme } from "./theme";
import { End, END_MS } from "./titles/End";
import { Intro, introDurationMs } from "./titles/Intro";

const W = 1920;
const H = 1080;
/** The face, moving between the middle and its corner, and the screen fading in or out. */
const LAYOUT_MS = 700;
/** A zoom's way in or out. */
const ZOOM_MS = 800;
const MAX_ZOOM = 2.2;
/** The face over the screen: this tall, this far from the corner. */
const PIP_H = 400;
const PIP_MARGIN = 40;
const AUDIO_FADE_MS = 40;
const ease = Easing.bezier(0.65, 0, 0.35, 1);

/** The opening title card's length: none when it's left out. */
export const openingMs = (m: Pick<EditManifest, "title" | "opening">) => (m.opening === false ? 0 : introDurationMs({ title: m.title }));

export const editDurationMs = (m: EditManifest) => openingMs(m) + m.cutMs + END_MS;

/** A video from a face camera and a screen recording, cut and laid out by a plan: see src/video/. */
export const Edit = (m: EditManifest) => {
  const { fps } = useVideoConfig();
  const f = (ms: number) => Math.round((ms / 1000) * fps);
  useBrandFont();
  const introMs = openingMs(m);
  const speaking = m.words.map((w) => [introMs + w.startMs, introMs + w.endMs] as const);
  const fadeFrames = Math.max(1, f(AUDIO_FADE_MS));
  // Each piece ends where the next begins, in frames: rounding each length alone leaves a
  // frame of black (or doubles one) at a cut.
  const frames = (s: EditManifest["segments"][number]) => Math.max(1, f(s.atMs + s.durationMs) - f(s.atMs));

  return (
    <AbsoluteFill style={{ background: "#000", fontFamily: theme.font }}>
      {introMs > 0 && (
        <Sequence durationInFrames={f(introMs)} name="Intro">
          <Intro title={m.title} subtitle={m.subtitle} />
        </Sequence>
      )}

      <Sequence from={f(introMs)} durationInFrames={f(m.cutMs)} name="Cut">
        <Fade frames={f(FADE_MS)}>
          {m.segments.map((s, i) => (
            <Sequence key={i} from={f(s.atMs)} durationInFrames={frames(s)} name={`${i + 1} ${s.layout}`}>
              <Segment m={m} i={i} />
            </Sequence>
          ))}
          <Captions steps={[{ startMs: 0, endMs: m.cutMs, words: m.words }]} top={900} fontSize={52} maxWidth={1200} />
        </Fade>
        {m.segments.map((s, i) => {
          const last = frames(s);
          return (
            <Sequence key={i} from={f(s.atMs)} durationInFrames={Math.max(1, last)} name={`Voice ${i + 1}`}>
              <Audio
                src={staticFile(s.sound === "screen" && m.screenSound ? m.screenSound : m.voice)}
                trimBefore={f(s.sound === "screen" && m.screen ? s.fromMs - m.screen.startMs : s.fromMs)}
                volume={(fr) =>
                  Math.min(
                    interpolate(fr, [0, fadeFrames], [0, 1], { extrapolateRight: "clamp" }),
                    interpolate(fr, [last - fadeFrames, last], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                  )
                }
              />
            </Sequence>
          );
        })}
      </Sequence>

      <Sequence from={f(introMs + m.cutMs)} durationInFrames={f(END_MS)} name="End">
        <End line={m.endLine} />
      </Sequence>

      {m.music && <DuckedMusic src={m.music} speaking={speaking} totalFrames={f(editDurationMs(m))} ducked={m.musicVolume} />}
    </AbsoluteFill>
  );
};

/** One piece of the cut: the screen (if it's in it, or fading out of it) and the face. */
const Segment = ({ m, i }: { m: EditManifest; i: number }) => {
  const { fps } = useVideoConfig();
  const s = m.segments[i];
  const t = s.atMs + (useCurrentFrame() / fps) * 1000;
  const screenness = screenAt(m, t);
  const f = (ms: number) => Math.round((ms / 1000) * fps);

  const sc = m.screen;
  const screenFrom = sc ? s.fromMs - sc.startMs : -1;
  const showScreen = sc && screenFrom >= 0 && screenness > 0;

  return (
    <AbsoluteFill>
      {showScreen && (
        <AbsoluteFill style={{ opacity: screenness, overflow: "hidden" }}>
          <ScreenVideo m={m} t={t} trimBefore={f(screenFrom)} />
        </AbsoluteFill>
      )}
      {m.face && s.fromMs >= m.face.startMs && <FaceVideo m={m} rect={faceRect(m, screenness)} trimBefore={f(s.fromMs - m.face.startMs)} />}
    </AbsoluteFill>
  );
};

const ScreenVideo = ({ m, t, trimBefore }: { m: EditManifest; t: number; trimBefore: number }) => {
  const sc = m.screen!;
  const base = Math.min(W / sc.width, H / sc.height);
  const cam = camAt(m, t);
  const k = base * cam.s;
  return (
    <OffthreadVideo
      src={staticFile(sc.src)}
      trimBefore={trimBefore}
      muted
      style={{ position: "absolute", width: sc.width * k, height: sc.height * k, left: W / 2 - cam.cx * k, top: H / 2 - cam.cy * k, maxWidth: "none" }}
    />
  );
};

type Rect = { x: number; y: number; w: number; h: number; r: number };

const FaceVideo = ({ m, rect, trimBefore }: { m: EditManifest; rect: Rect; trimBefore: number }) => {
  const small = rect.h < H - 1;
  return (
    <div
      style={{
        position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, overflow: "hidden", borderRadius: rect.r,
        boxShadow: small ? `0 18px 50px rgba(0,0,0,${0.45 * (1 - rect.h / H)}), 0 0 0 3px rgba(255,255,255,${0.85 * (1 - rect.h / H)})` : undefined,
      }}
    >
      <OffthreadVideo src={staticFile(m.face!.src)} trimBefore={trimBefore} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  );
};

/** 1 when the screen is the picture (face in its corner), 0 when the face is alone; between while it changes. */
function screenAt(m: EditManifest, t: number): number {
  if (!m.face) return 1;
  if (!m.screen) return 0;
  const value = (l: string) => (l === "screen" ? 1 : 0);
  const i = m.segments.findLastIndex((s) => s.atMs <= t);
  const cur = m.segments[Math.max(0, i)];
  // Where the layout last changed, and from what.
  let k = Math.max(0, i);
  while (k > 0 && m.segments[k - 1].layout === cur.layout) k--;
  if (k === 0) return value(cur.layout);
  const p = ease(clamp((t - m.segments[k].atMs) / LAYOUT_MS, 0, 1));
  return lerp(value(m.segments[k - 1].layout), value(cur.layout), p);
}

/** The face in the middle, full height, or small in the bottom right corner; `p` between. */
function faceRect(m: EditManifest, p: number): Rect {
  const aspect = m.face!.width / m.face!.height;
  const full = { x: (W - H * aspect) / 2, y: 0, w: H * aspect, h: H, r: 0 };
  if (!m.screen) return full;
  const pip = { x: W - PIP_MARGIN - PIP_H * aspect, y: H - PIP_MARGIN - PIP_H, w: PIP_H * aspect, h: PIP_H, r: 24 };
  return { x: lerp(full.x, pip.x, p), y: lerp(full.y, pip.y, p), w: lerp(full.w, pip.w, p), h: lerp(full.h, pip.h, p), r: lerp(full.r, pip.r, p) };
}

type Cam = { cx: number; cy: number; s: number };

/** Where the camera on the screen looks (its pixels) and how close, at `t` ms of the cut. */
function camAt(m: EditManifest, t: number): Cam {
  const sc = m.screen!;
  const overview: Cam = { cx: sc.width / 2, cy: sc.height / 2, s: 1 };
  const base = Math.min(W / sc.width, H / sc.height);
  const target = (b: [number, number, number, number]): Cam => {
    const s = clamp(Math.min((0.8 * W) / (b[2] * base), (0.75 * H) / (b[3] * base)), 1, MAX_ZOOM);
    // Keep the crop on the screen.
    const cw = W / (base * s) / 2;
    const ch = H / (base * s) / 2;
    return { cx: clamp(b[0] + b[2] / 2, cw, sc.width - cw), cy: clamp(b[1] + b[3] / 2, ch, sc.height - ch), s };
  };
  // Moves, in order; each from wherever the camera was when it began.
  const moves = m.zooms.flatMap((z) => [{ t: z.atMs, to: target(z.box) }, { t: z.untilMs, to: overview }]).sort((a, b) => a.t - b.t);
  const keys: { t: number; from: Cam; to: Cam }[] = [];
  for (const mv of moves) keys.push({ ...mv, from: keys.length ? sample(keys.at(-1)!, mv.t) : overview });
  const k = keys.findLast((key) => key.t <= t);
  return k ? sample(k, t) : overview;
}

function sample(k: { t: number; from: Cam; to: Cam }, t: number): Cam {
  const p = ease(clamp((t - k.t) / ZOOM_MS, 0, 1));
  // Zoom feels even when it changes in log space.
  return { cx: lerp(k.from.cx, k.to.cx, p), cy: lerp(k.from.cy, k.to.cy, p), s: Math.exp(lerp(Math.log(k.from.s), Math.log(k.to.s), p)) };
}
