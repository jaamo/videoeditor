import { Composition, type CalculateMetadataFunction } from "remotion";
import type { Manifest } from "../types";
import { H, W } from "./camera";
import { INTRO_MS, OUTRO_MS } from "./theme";
import { Video } from "./Video";

// Real props come from out/<video>/manifest.json via --props; this only lets the bundle load.
const placeholder: Manifest = {
  fps: 30,
  viewport: { width: 1280, height: 800 },
  lang: "en",
  introMs: INTRO_MS,
  title: { headline: "Title" },
  end: { headline: "End" },
  screenDurationMs: 3000,
  frames: [],
  events: [],
  steps: [],
};

const metadata: CalculateMetadataFunction<Manifest> = ({ props }) => ({
  fps: props.fps,
  durationInFrames: Math.ceil(((props.introMs + props.screenDurationMs + OUTRO_MS) / 1000) * props.fps),
});

export const Root = () => (
  <Composition
    id="Video"
    component={Video}
    width={W}
    height={H}
    fps={30}
    durationInFrames={1}
    defaultProps={placeholder}
    calculateMetadata={metadata}
  />
);
