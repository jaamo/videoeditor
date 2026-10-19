import { useEffect, useState } from "react";
import {
  AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import type { Manifest } from "../types";
import { Captions } from "./Captions";
import { EndCard } from "./EndCard";
import { ScreenScene } from "./ScreenScene";
import { FADE_MS, OUTRO_MS, theme, warmBackground } from "./theme";
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

      {m.music && <Music src={m.music} manifest={m} totalFrames={total} />}
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

const Fade = ({ frames, children }: { frames: number; children: React.ReactNode }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, frames], [0, 1], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

/** Music under the whole video: fades in and out, and ducks while the voice is talking. */
const Music = ({ src, manifest, totalFrames }: { src: string; manifest: Manifest; totalFrames: number }) => {
  const { fps } = useVideoConfig();
  const lines = manifest.steps.map((s) => ({ at: manifest.introMs + s.startMs, words: s.words }));
  if (manifest.intro) lines.push({ at: manifest.intro.startMs, words: manifest.intro.words });
  const speaking = lines
    .filter((l) => l.words.length)
    .map((l) => [l.at + l.words[0].startMs, l.at + l.words.at(-1)!.endMs] as const);
  const BASE = 0.32;
  const DUCKED = 0.1;
  return (
    <Audio
      src={staticFile(src)}
      loop
      volume={(frame) => {
        const ms = (frame / fps) * 1000;
        // 1 while speaking, easing to 0 over 300ms either side.
        let duck = 0;
        for (const [a, b] of speaking) {
          const d = ms < a ? a - ms : ms > b ? ms - b : 0;
          duck = Math.max(duck, interpolate(d, [0, 300], [1, 0], { extrapolateRight: "clamp" }));
        }
        const fade = Math.min(
          interpolate(frame, [0, fps * 0.6], [0, 1], { extrapolateRight: "clamp" }),
          interpolate(frame, [totalFrames - fps * 1.5, totalFrames], [1, 0], { extrapolateLeft: "clamp" }),
        );
        return (BASE - (BASE - DUCKED) * duck) * fade;
      }}
    />
  );
};

/** Hold every frame until the brand font is in, so none renders in the fallback face. */
function useBrandFont() {
  const [handle] = useState(() => delayRender("Loading brand font"));
  useEffect(() => {
    const font = new FontFace("Google Sans Flex", `url(${staticFile("brand/google-sans-flex.woff2")}) format("woff2")`, {
      weight: "100 900",
      stretch: "25% 151%",
    });
    font
      .load()
      .then(() => document.fonts.add(font))
      .finally(() => continueRender(handle));
  }, [handle]);
}
