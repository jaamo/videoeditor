import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import type { Manifest } from "../types";
import { Captions } from "./Captions";
import { EndCard } from "./EndCard";
import { ScreenScene } from "./ScreenScene";
import { FADE_MS, OUTRO_MS, theme, warmBackground } from "./theme";
import { DuckedMusic, Fade, useBrandFont } from "./shared";
import { TitleCard } from "./TitleCard";

export const Video = (m: Manifest) => {
  const { fps } = useVideoConfig();
  const f = (ms: number) => Math.round((ms / 1000) * fps);
  useBrandFont();

  const intro = m.introMs;
  const total = f(intro + m.screenDurationMs + OUTRO_MS);

  return (
    <AbsoluteFill style={{ background: warmBackground, fontFamily: theme.font }}>
      <Sequence durationInFrames={f(intro)} name="Title">
        <TitleCard {...m.title} durationMs={intro} />
        {m.intro && <Captions steps={[{ startMs: m.intro.startMs, endMs: intro, words: m.intro.words }]} />}
      </Sequence>
      {m.intro?.audio && (
        <Sequence from={f(m.intro.startMs)} name="Intro voice" layout="none">
          <Voice src={m.intro.audio} endMs={m.intro.audioEndMs} />
        </Sequence>
      )}

      <Sequence from={f(intro)} durationInFrames={f(m.screenDurationMs)} name="Screen">
        <Fade frames={f(FADE_MS)}>
          <ScreenScene manifest={m} />
          <Captions steps={m.steps} />
        </Fade>
      </Sequence>

      <Sequence from={f(intro + m.screenDurationMs - FADE_MS)} name="End">
        <Fade frames={f(FADE_MS)}>
          <EndCard {...m.end} />
        </Fade>
      </Sequence>

      {m.steps.map((s, i) =>
        s.audio ? (
          <Sequence key={i} from={f(intro + s.startMs)} name={`Voice ${i + 1}`} layout="none">
            <Voice src={s.audio} endMs={s.audioEndMs} />
          </Sequence>
        ) : null,
      )}

      {m.music && <DuckedMusic src={m.music} speaking={speakingRanges(m)} totalFrames={total} />}
    </AbsoluteFill>
  );
};

/** A narration clip, stopped where the speech ends with a quick fade, so no stray tail plays. */
const Voice = ({ src, endMs }: { src: string; endMs?: number }) => {
  const { fps } = useVideoConfig();
  if (endMs === undefined) return <Audio src={staticFile(src)} />;
  const end = Math.max(1, Math.round((endMs / 1000) * fps));
  const fade = Math.max(1, Math.round(0.1 * fps));
  return (
    <Audio
      src={staticFile(src)}
      trimAfter={end}
      volume={(frame) => interpolate(frame, [end - fade, end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
    />
  );
};

/** When the voice is talking, in ms from the start of the video. */
function speakingRanges(m: Manifest) {
  const lines = m.steps.map((s) => ({ at: m.introMs + s.startMs, words: s.words }));
  if (m.intro) lines.push({ at: m.intro.startMs, words: m.intro.words });
  return lines
    .filter((l) => l.words.length)
    .map((l) => [l.at + l.words[0].startMs, l.at + l.words.at(-1)!.endMs] as const);
}
