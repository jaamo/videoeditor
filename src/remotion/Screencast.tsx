import { useMemo } from "react";
import { AbsoluteFill, Audio, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { ScreencastClip, ScreencastManifest } from "../types";
import { cameraTrack, H, overviewCam, SCREENCAST_CAMERA, W } from "./camera";
import { Captions } from "./Captions";
import { EndCard } from "./EndCard";
import { DuckedMusic, Fade, useBrandFont } from "./shared";
import { FADE_MS, INTRO_MS, OUTRO_MS, theme, warmBackground } from "./theme";
import { TitleCard } from "./TitleCard";

/** Fade sound in and out at each cut, so the joins don't click. */
const AUDIO_FADE_MS = 40;

/** A screen recording, cut down to its kept clips. */
export const Screencast = (m: ScreencastManifest) => {
  const { fps } = useVideoConfig();
  const f = (ms: number) => Math.round((ms / 1000) * fps);
  useBrandFont();
  const total = f(INTRO_MS + m.screenDurationMs + OUTRO_MS);

  const speaking = m.clips
    .filter((c) => c.words.length)
    .map((c) => [INTRO_MS + c.startMs + c.words[0].startMs, INTRO_MS + c.startMs + c.words.at(-1)!.endMs] as const);

  return (
    <AbsoluteFill style={{ background: warmBackground, fontFamily: theme.font }}>
      <Sequence durationInFrames={f(INTRO_MS)} name="Title">
        <TitleCard {...m.title} durationMs={INTRO_MS} />
      </Sequence>

      <Sequence from={f(INTRO_MS)} durationInFrames={f(m.screenDurationMs)} name="Screen">
        <Fade frames={f(FADE_MS)}>
          {m.clips.map((c, i) => (
            <Sequence key={i} from={f(c.startMs)} durationInFrames={Math.max(1, f(c.durationMs))} name={`Clip ${i + 1}`}>
              <Clip clip={c} manifest={m} />
            </Sequence>
          ))}
          <Captions steps={m.clips.map((c) => ({ startMs: c.startMs, endMs: c.startMs + c.durationMs, words: c.words }))} />
        </Fade>
      </Sequence>

      <Sequence from={f(INTRO_MS + m.screenDurationMs - FADE_MS)} name="End">
        <Fade frames={f(FADE_MS)}>
          <EndCard {...m.end} />
        </Fade>
      </Sequence>

      {m.music && <DuckedMusic src={m.music} speaking={speaking} totalFrames={total} ducked={m.musicVolume} />}
    </AbsoluteFill>
  );
};

const Clip = ({ clip: c, manifest: m }: { clip: ScreencastClip; manifest: ScreencastManifest }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const { width: vw, height: vh } = m.sourceSize;

  // The first look is where the clip opens, with no pan in from the clip before it.
  const camAt = useMemo(
    () =>
      cameraTrack(
        c.cams.map((k, i) => ({ type: "camera" as const, t: k.atMs, box: k.box, instant: i === 0 })),
        vw,
        vh,
        SCREENCAST_CAMERA,
      ),
    [c.cams, vw, vh],
  );
  const cam = camAt(ms);
  const zoomedIn = interpolate(cam.s, [overviewCam(vw, vh).s, H / vh], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const fadeFrames = Math.max(1, Math.round((AUDIO_FADE_MS / 1000) * fps));
  const trimBefore = Math.round((c.fromMs / 1000) * fps);
  const trimAfter = Math.round((c.toMs / 1000) * fps);
  const lastFrame = Math.round((c.durationMs / 1000) * fps);

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute", left: 0, top: 0, width: vw, height: vh, transformOrigin: "0 0",
          transform: `translate(${W / 2 - cam.cx * cam.s}px, ${H / 2 - cam.cy * cam.s}px) scale(${cam.s})`,
          borderRadius: 18 * (1 - zoomedIn), overflow: "hidden",
          boxShadow: `0 30px 80px rgba(59,42,34,${0.25 * (1 - zoomedIn)})`,
        }}
      >
        <OffthreadVideo
          src={staticFile(m.source)}
          trimBefore={trimBefore}
          trimAfter={trimAfter}
          playbackRate={c.speed}
          muted
          style={{ width: vw, height: vh, display: "block" }}
        />
      </div>
      {!c.muted && (
        <Audio
          src={staticFile(m.voice)}
          trimBefore={trimBefore}
          trimAfter={trimAfter}
          volume={(f) =>
            Math.min(
              interpolate(f, [0, fadeFrames], [0, 1], { extrapolateRight: "clamp" }),
              interpolate(f, [lastFrame - fadeFrames, lastFrame], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            )
          }
        />
      )}
      {c.speed !== 1 && <SpeedBadge speed={c.speed} />}
    </AbsoluteFill>
  );
};

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
