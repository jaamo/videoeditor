import { Composition, type CalculateMetadataFunction } from "remotion";
import type { ShortManifest } from "../types";
import { Short } from "./Short";

// Real props come from projects/<name>/tmp/manifest.json via --props; this only lets the bundle load.
const placeholder: ShortManifest = {
  fps: 30, width: 1080, height: 1920, durationFrames: 90,
  sources: [], tracks: [], audio: [], lines: [], musicVolume: 0.08, grade: 1,
};

const metadata: CalculateMetadataFunction<ShortManifest> = ({ props }) => ({
  fps: props.fps,
  width: props.width,
  height: props.height,
  durationInFrames: Math.max(1, props.durationFrames),
});

export const Root = () => (
  <Composition id="Short" component={Short} width={1080} height={1920} fps={30} durationInFrames={90} defaultProps={placeholder} calculateMetadata={metadata} />
);
