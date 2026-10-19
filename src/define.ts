import type { VideoScript } from "./types.ts";

/** Identity function: exists so a video file gets types and autocompletion. */
export const defineVideo = (script: VideoScript) => script;
