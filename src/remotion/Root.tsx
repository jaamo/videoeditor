import { Composition, type CalculateMetadataFunction } from "remotion";
import type { EditManifest, FinalManifest, Manifest, ScreencastManifest } from "../types";
import { Edit, editDurationMs } from "./Edit";
import { H, W } from "./camera";
import { Final, finalDurationMs } from "./Final";
import { INTRO_MS, OUTRO_MS } from "./theme";
import { Screencast } from "./Screencast";
import { End, END_MS } from "./titles/End";
import { Intro, introDurationMs, type IntroProps } from "./titles/Intro";
import { FPS as TITLE_FPS, H as TITLE_H, W as TITLE_W } from "./titles/theme";
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

const finalPlaceholder: FinalManifest = {
  fps: 30,
  title: "Title",
  footage: "footage.mp4",
  voice: "voice.wav",
  musicVolume: 0.1,
  video: [],
  audio: [],
  cutMs: 3000,
  words: [],
};

const editPlaceholder: EditManifest = {
  fps: 30,
  title: "Title",
  voice: "voice.wav",
  musicVolume: 0.1,
  segments: [],
  zooms: [],
  cutMs: 3000,
  words: [],
};

const editMetadata: CalculateMetadataFunction<EditManifest> = ({ props }) => ({
  fps: props.fps,
  durationInFrames: Math.ceil((editDurationMs(props) / 1000) * props.fps),
});

const finalMetadata: CalculateMetadataFunction<FinalManifest> = ({ props }) => ({
  fps: props.fps,
  durationInFrames: Math.ceil((finalDurationMs(props) / 1000) * props.fps),
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
  {/* A project of projects/: its Kdenlive cut, finished. See src/screencast/new.ts. */}
  <Composition
    id="Final"
    component={Final}
    width={TITLE_W}
    height={TITLE_H}
    fps={30}
    durationInFrames={1}
    defaultProps={finalPlaceholder}
    calculateMetadata={finalMetadata}
  />
  {/* A face camera and a screen recording, edited by the agents from a plan. See src/video/. */}
  <Composition
    id="Edit"
    component={Edit}
    width={TITLE_W}
    height={TITLE_H}
    fps={30}
    durationInFrames={1}
    defaultProps={editPlaceholder}
    calculateMetadata={editMetadata}
  />
  {/* Its title cards on their own, to work on: npm run titles. */}
  <Composition
    id="Intro"
    component={Intro}
    width={TITLE_W}
    height={TITLE_H}
    fps={TITLE_FPS}
    durationInFrames={1}
    defaultProps={{ title: "Outerview kahdessa minuutissa" } as IntroProps}
    calculateMetadata={({ props }: { props: IntroProps }) => ({ durationInFrames: Math.round((introDurationMs(props) / 1000) * TITLE_FPS) })}
  />
  <Composition id="End" component={End} width={TITLE_W} height={TITLE_H} fps={TITLE_FPS} durationInFrames={Math.round((END_MS / 1000) * TITLE_FPS)} defaultProps={{} as { line?: string }} />
  </>
);
