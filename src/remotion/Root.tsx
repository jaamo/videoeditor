import { Composition, type CalculateMetadataFunction } from "remotion";
import type { Manifest, ScreencastManifest } from "../types";
import { H, W } from "./camera";
import { INTRO_MS, OUTRO_MS } from "./theme";
import { Screencast } from "./Screencast";
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

const screencastPlaceholder: ScreencastManifest = {
  fps: 30,
  source: "source.mp4",
  voice: "voice.wav",
  sourceSize: { width: 1920, height: 1080 },
  title: { headline: "Title" },
  end: { headline: "End" },
  musicVolume: 0.12,
  screenDurationMs: 3000,
  clips: [],
};

const screencastMetadata: CalculateMetadataFunction<ScreencastManifest> = ({ props }) => ({
  fps: props.fps,
  durationInFrames: Math.ceil(((INTRO_MS + props.screenDurationMs + OUTRO_MS) / 1000) * props.fps),
});

export const Root = () => (
  <>
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
  {/* A hand-made screen recording, edited from its transcript: see src/screencast/. */}
  <Composition
    id="Screencast"
    component={Screencast}
    width={W}
    height={H}
    fps={30}
    durationInFrames={1}
    defaultProps={screencastPlaceholder}
    calculateMetadata={screencastMetadata}
  />
  </>
);
