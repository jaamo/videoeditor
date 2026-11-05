import { useEffect, useState } from "react";
import { Audio, continueRender, delayRender, interpolate, staticFile, useVideoConfig } from "remotion";

/**
 * Music under the whole video: fades in and out, and ducks while someone is talking.
 * `speaking` is [start, end] ms ranges of speech, from the start of the video.
 */
export const DuckedMusic = ({
  src, speaking, totalFrames, base = 0.28, ducked = 0.08,
}: { src: string; speaking: (readonly [number, number])[]; totalFrames: number; base?: number; ducked?: number }) => {
  const { fps } = useVideoConfig();
  return (
    <Audio
      src={staticFile(src)}
      loop
      volume={(frame) => {
        const ms = (frame / fps) * 1000;
        let duck = 0;
        for (const [a, b] of speaking) {
          const d = ms < a ? a - ms : ms > b ? ms - b : 0;
          duck = Math.max(duck, interpolate(d, [0, 300], [1, 0], { extrapolateRight: "clamp" }));
        }
        const fade = Math.min(
          interpolate(frame, [0, fps * 0.4], [0, 1], { extrapolateRight: "clamp" }),
          interpolate(frame, [totalFrames - fps * 1.2, totalFrames], [1, 0], { extrapolateLeft: "clamp" }),
        );
        return (base - (base - ducked) * duck) * fade;
      }}
    />
  );
};

/** Hold every frame until the font is in, so none renders in the fallback face. */
export function useBrandFont() {
  const [handle] = useState(() => delayRender("Loading font"));
  useEffect(() => {
    const font = new FontFace("Google Sans Flex", `url(${staticFile("brand/google-sans-flex.woff2")}) format("woff2")`, { weight: "100 900", stretch: "25% 151%" });
    font.load().then(() => document.fonts.add(font)).finally(() => continueRender(handle));
  }, [handle]);
}
