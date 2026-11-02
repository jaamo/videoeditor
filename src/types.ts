// Shared between the Node pipeline and the Remotion bundle, so: types only, no imports.

/** A rectangle in CSS pixels, relative to the browser viewport. */
export type Box = { x: number; y: number; width: number; height: number };

/** The handle a step's `do` gets: Playwright, plus actions that log themselves for the video. */
export interface Director {
  page: import("playwright").Page;
  /** Move the cursor to an element, click it. The camera follows. */
  click(selector: string): Promise<void>;
  /** Click into a field and type, one key at a time. */
  type(selector: string, text: string, opts?: { clear?: boolean; delayMs?: number }): Promise<void>;
  /** Drag-select a phrase inside a textarea or input. The camera zooms to that line. */
  select(selector: string, text: string): Promise<void>;
  /** Type at the caret, replacing any selection. */
  keys(text: string, opts?: { delayMs?: number }): Promise<void>;
  /**
   * Draw a spotlight around an element until the step ends (or for `ms`). With `all`, one
   * spotlight around every visible match, e.g. all the changed words of a diff.
   */
  highlight(selector: string, opts?: { ms?: number; all?: boolean }): Promise<void>;
  /** Point the camera at an element without touching it. */
  focus(selector: string): Promise<void>;
  /** Zoom the camera out to show the whole screen. */
  overview(): Promise<void>;
  /** Move the cursor over an element without clicking. */
  hover(selector: string): Promise<void>;
  /** Scroll an element into the middle of the viewport, smoothly. */
  scrollTo(selector: string): Promise<void>;
  /** Load another page. Shown as a straight cut with a cross-fade; the loading isn't. */
  goto(path: string): Promise<void>;
  wait(ms: number): Promise<void>;
  /**
   * Run something slow (an AI reply, a page load) and keep only `keepMs` of it in the
   * video, sped up to fit; 0 makes it a straight cut. Narration timing ignores the time
   * cut out. Inside, wait on the page; don't use other director actions. Default keepMs 1200.
   */
  cut(fn: () => Promise<unknown>, opts?: { keepMs?: number }): Promise<void>;
}

/** Plain text, or one per language: `{ en: "Save it.", fi: "Tallenna." }`. */
export type Localized = string | Record<string, string>;

export type Step = {
  /** Narration for this step. The step lasts at least as long as this takes to say. */
  say?: Localized;
  /** Optional short label shown at the top of the frame during this step. */
  label?: Localized;
  do?: (d: Director) => Promise<void>;
  /**
   * Where this line's clip stops, in ms, to cut a stray sound off the end of a take:
   * `{ fi: 3150 }`. Per language, as each language is its own take.
   */
  voiceEnd?: Record<string, number>;
  /** Extra silence after the narration, before the next step. Default 300ms. */
  pauseAfterMs?: number;
};

/** A title or end card, as Remotion gets it: in one language. */
export type Card = { headline: string; sub?: string; url?: string };

export type VideoScript = {
  title: { [K in keyof Card]: Localized };
  end: { [K in keyof Card]: Localized };
  /** Spoken over the title card, which stays up until it's said. */
  intro?: { say: Localized; voiceEnd?: Record<string, number> };
  /**
   * ElevenLabs model for this video, over ELEVENLABS_MODEL_ID. "eleven_v4" and "eleven_v3"
   * perform audio tags in the narration: [laughs], [sighs], [whispers], [clears throat]...
   */
  model?: string;
  /** Narration language when the build doesn't name one with --lang. Default "en". */
  lang?: string;
  /** Path in the app to open before recording starts. */
  start: string;
  /**
   * Runs before recording starts, after login: put demo data back, dismiss things. `sql`
   * reaches the local app database (OUTERVIEW_DATABASE_URL); `userId` is the demo user.
   */
  setup?: (ctx: { page: import("playwright").Page; sql: import("./db.ts").Sql; userId: string }) => Promise<void>;
  /** Browser size in CSS pixels. Narrower crops better to vertical. Default 1280×800. */
  viewport?: { width: number; height: number };
  /** Path to a music file, relative to the project root. */
  music?: string;
  steps: Step[];
};

// ---------------------------------------------------------------------------
// What the pipeline hands to Remotion. All times are ms from the start of the
// screen recording.

export type Word = { text: string; startMs: number; endMs: number };

export type Frame = { file: string; t: number };

export type TimelineEvent =
  // box null = overview; instant = jump there, as after a straight cut
  | { type: "camera"; t: number; box: Box | null; instant?: boolean }
  | { type: "move"; t: number; to: { x: number; y: number }; durationMs: number }
  | { type: "click"; t: number; at: { x: number; y: number } }
  | { type: "highlight"; t: number; box: Box; untilMs: number }
  /** From t, `keepMs` of video stands for `speed` times as much real time. */
  | { type: "cut"; t: number; keepMs: number; speed: number };

export type ManifestStep = {
  startMs: number;
  endMs: number;
  label?: string;
  audio?: string; // published path, e.g. voice/0.mp3
  /** Play the clip only this far (ms into it): past it is a stray sound, not speech. */
  audioEndMs?: number;
  words: Word[];
};

/** One kept piece of a screen recording, placed in the video. Times in ms. */
export type ScreencastClip = {
  /** Where it is in the recording. */
  fromMs: number;
  toMs: number;
  speed: number;
  muted: boolean;
  /** Where it starts in the video's screen part, and how long it lasts there. */
  startMs: number;
  durationMs: number;
  /** Camera moves, `atMs` into the clip; box null = whole screen. */
  cams: { atMs: number; box: Box | null }[];
  /** Caption words, timed from the clip's start. */
  words: Word[];
};

export type ScreencastManifest = {
  fps: number;
  /** Published path of the recording, and its size in pixels. */
  source: string;
  /** The recording's voice, cleaned (see src/screencast/voice.ts); plays instead of its sound. */
  voice: string;
  sourceSize: { width: number; height: number };
  title: Card;
  end: Card;
  music?: string;
  musicVolume: number;
  screenDurationMs: number;
  clips: ScreencastClip[];
};

export type Manifest = {
  fps: number;
  viewport: { width: number; height: number };
  lang: string;
  /** Length of the title card. The screen recording starts after it. */
  introMs: number;
  /** Narration over the title card, timed from the start of the video. */
  intro?: { audio?: string; audioEndMs?: number; startMs: number; words: Word[] };
  title: Card;
  end: Card;
  music?: string;
  screenDurationMs: number;
  frames: Frame[];
  events: TimelineEvent[];
  steps: ManifestStep[];
};

/** A project of projects/: its cut, made in Kdenlive, to finish in Remotion (src/remotion/Final.tsx). */
export type FinalManifest = {
  fps: number;
  title: string;
  /** Published paths of the footage, its cleaned voice and the music. */
  footage: string;
  voice: string;
  music?: string;
  musicVolume: number;
  /** The cut, in ms from its start: pieces of the footage, and of the voice (`fromMs` in the file). */
  video: { atMs: number; fromMs: number; durationMs: number; speed: number }[];
  audio: { atMs: number; fromMs: number; durationMs: number }[];
  cutMs: number;
  /** Captions, timed from the start of the cut. */
  words: Word[];
  /** Caption lines as polished in Kdenlive, to show instead of the words a few at a time. */
  lines?: { endMs: number; words: Word[] }[];
};
