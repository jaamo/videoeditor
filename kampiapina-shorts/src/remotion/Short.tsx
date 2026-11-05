import { AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { placeIn, rectAt } from "../keys";
import type { ShortManifest } from "../types";
import { Captions } from "./Captions";
import { Grade } from "./Grade";
import { DuckedMusic, useBrandFont } from "./shared";

type Track = ShortManifest["tracks"][number];
type Clip = Track["clips"][number];

/**
 * A short: its cut as it is in Kdenlive (every clip of every track, each where its Transform
 * puts it, frame by frame), graded, with captions, the sound of the cut, and music.
 */
export const Short = (m: ShortManifest) => {
  useBrandFont();
  const speaking = m.lines.flatMap((l) => l.words.map((w) => [w.startMs, w.endMs] as const));
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Grade strength={m.grade}>
        {m.tracks.map((t, i) => (
          <TrackLayer key={i} m={m} t={t} />
        ))}
      </Grade>
      <Captions lines={m.lines} />
      {m.audio.map((a, i) => (
        <Sequence key={i} from={a.atF} durationInFrames={Math.max(1, a.durF)} name={`Sound ${i + 1}`}>
          <Audio
            src={staticFile(a.src)}
            trimBefore={a.fromF}
            volume={(fr) =>
              a.gain *
              Math.min(
                interpolate(fr, [0, a.fadeInF], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                interpolate(fr, [a.durF - a.fadeOutF, a.durF], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              )
            }
          />
        </Sequence>
      ))}
      {m.music && <DuckedMusic src={m.music} speaking={speaking} totalFrames={m.durationFrames} ducked={m.musicVolume} />}
    </AbsoluteFill>
  );
};

/** One video track: its clips, and the track's own Transform over all of them, if it has one. */
const TrackLayer = ({ m, t }: { m: ShortManifest; t: Track }) => {
  const frame = useCurrentFrame();
  let style: React.CSSProperties = {};
  if (t.keys?.length) {
    const r = placeIn(rectAt(t.keys, frame), { width: m.width, height: m.height });
    style = { transformOrigin: "0 0", transform: `translate(${r.left}px, ${r.top}px) scale(${r.scale})`, opacity: r.opacity };
  }
  return (
    <AbsoluteFill style={style}>
      {t.clips.map((c, i) => (
        <Sequence key={i} from={c.atF} durationInFrames={Math.max(1, c.durF)}>
          <ClipView m={m} c={c} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

const ClipView = ({ m, c }: { m: ShortManifest; c: Clip }) => {
  const frame = useCurrentFrame();
  const src = m.sources[c.source];
  const r = placeIn(rectAt(c.keys, frame), src);
  // Kdenlive blurs the clip's picture at the project's size: the same radius here.
  const filter = [c.blur ? `blur(${c.blur}px)` : "", c.brightness !== undefined ? `brightness(${c.brightness})` : ""].filter(Boolean).join(" ");
  const style: React.CSSProperties = { position: "absolute", left: r.left, top: r.top, width: r.width, height: r.height, opacity: r.opacity, maxWidth: "none", ...(filter ? { filter } : {}) };
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {src.image ? (
        <Img src={staticFile(src.src)} style={style} />
      ) : (
        <OffthreadVideo src={staticFile(src.src)} trimBefore={c.fromF} playbackRate={c.speed} muted style={style} />
      )}
    </AbsoluteFill>
  );
};
