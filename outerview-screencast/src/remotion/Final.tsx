import { AbsoluteFill, Audio, interpolate, OffthreadVideo, Sequence, staticFile, useVideoConfig } from "remotion";
import type { FinalManifest } from "../types";
import { Captions } from "./Captions";
import { DuckedMusic, Fade, useBrandFont } from "./shared";
import { FADE_MS, theme } from "./theme";
import { End, END_MS } from "./titles/End";
import { Intro, introDurationMs } from "./titles/Intro";

/** Fade sound in and out at each cut, so the joins don't click. */
const AUDIO_FADE_MS = 40;

export const finalDurationMs = (m: FinalManifest) => introDurationMs({ title: m.title }) + m.cutMs + END_MS;

/** A project's video: the intro, its cut as made in Kdenlive, with captions and music, and the end. */
export const Final = (m: FinalManifest) => {
  const { fps } = useVideoConfig();
  const f = (ms: number) => Math.round((ms / 1000) * fps);
  useBrandFont();
  const introMs = introDurationMs({ title: m.title });

  const speaking = m.words.map((w) => [introMs + w.startMs, introMs + w.endMs] as const);
  const fadeFrames = Math.max(1, f(AUDIO_FADE_MS));

  return (
    <AbsoluteFill style={{ background: "#000", fontFamily: theme.font }}>
      <Sequence durationInFrames={f(introMs)} name="Intro">
        <Intro title={m.title} />
      </Sequence>

      <Sequence from={f(introMs)} durationInFrames={f(m.cutMs)} name="Cut">
        <Fade frames={f(FADE_MS)}>
          {m.video.map((v, i) => (
            <Sequence key={i} from={f(v.atMs)} durationInFrames={Math.max(1, f(v.durationMs))} name={`Video ${i + 1}`}>
              <OffthreadVideo
                src={staticFile(m.footage)}
                trimBefore={f(v.fromMs)}
                playbackRate={v.speed}
                muted
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </Sequence>
          ))}
          <Captions steps={[{ startMs: 0, endMs: m.cutMs, words: m.words }]} lines={m.lines} top={880} fontSize={54} maxWidth={1500} />
        </Fade>
        {m.audio.map((a, i) => {
          const last = f(a.durationMs);
          return (
            <Sequence key={i} from={f(a.atMs)} durationInFrames={Math.max(1, last)} name={`Voice ${i + 1}`}>
              <Audio
                src={staticFile(m.voice)}
                trimBefore={f(a.fromMs)}
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
        <End />
      </Sequence>

      {m.music && <DuckedMusic src={m.music} speaking={speaking} totalFrames={f(finalDurationMs(m))} ducked={m.musicVolume} />}
    </AbsoluteFill>
  );
};
