# kampiapina-shorts

Vertical shorts (1080×1920) for Kampiapina from a 4K camera recording, with b-roll and
screen recordings cut in. Agents make the first cut in Kdenlive, you fix it there, and the
agents finish it: captions in white and Kampiapina red, a hard cut closer on the two lines that
matter, a warm faded retro look, music under the voice.

```bash
npm install
cp .env.example .env     # OPENAI_API_KEY (transcripts), ELEVENLABS_API_KEY (voice clean-up, optional)
```

Then in Claude Code, from this folder:

```
/make-short trail-tips
```

## The three phases

1. **First cut (agents).** Drop all the files in `projects/<name>/`: the talking head,
   b-roll, screen recordings, no sorting. The analyzer sorts them into `footage/` by
   looking at them (and asks if it can't tell), cleans the voice, transcribes it and looks at everything; the planner picks the hook,
   cuts out pauses, retakes and fillers, frames the speaker in the 9:16 crop, puts in
   emphasis zooms and inserts (`plan.yaml`), and makes `<name>.kdenlive` from it.
2. **You, in Kdenlive** (`npm run short -- open <name>`): fix timings and cuts, move or
   swap inserts, change zooms, and fix the captions' text and timing on the Subtitles
   track. Kdenlive shows them plainly; the render draws them in the short's style. No grade
   there.

   | Track | What |
   |---|---|
   | B-roll / screen | inserts over the camera |
   | Backdrop | a blurred, dimmed fill behind a screen recording shown whole |
   | Camera | the camera's pieces; each has a **Transform** effect with the framing and the emphasis zooms as keyframes |
   | Insert sound | an insert's own audio, when the plan gives it `sound` |
   | Voice | the cleaned voice, grouped with its camera piece |

   Guides mark each piece and why it's there. Zooms are the Transform keyframes: move
   them, change them, add your own; any easing works. Save when you're done.
3. **Finish (agents).** Say it's done: the finisher renders `out.mp4` with the captions as
   you left them on the Subtitles track (`<name>.kdenlive.ass`). No review: you've already
   reviewed the cut in Kdenlive (ask for one if you want it).

Everything is read from the `.kdenlive` file when rendering: every clip of every track,
its Transform (keyframes, easing), Gaussian blur and Brightness, speed changes, and on
sound its fades and Volume. Other effects, titles and transitions made in Kdenlive aren't
rendered (the render says which).

## The look

- **Captions**: a few big white words at a time, low in the middle; the word being said on
  a block of Kampiapina red, `#911B1B` (`src/remotion/theme.ts`, `src/remotion/Captions.tsx`).
- **Emphasis zooms**: two at most, on the strongest lines: a hard cut to closer
  (×1.15–1.3), held while the phrase is said, and a hard cut back. The face sits high,
  its eyes about a third down, so the captions below don't cover it. A 4K landscape camera cropped to
  9:16 is shown at 0.89× its pixels, so a ×1.15 zoom is still sharp; a 4K vertical one
  has room for ×2.
- **Grade**: colours a little washed out, a warm cast, blacks lifted to warm brown,
  highlights held back, a soft vignette and fine grain (`src/remotion/Grade.tsx`).
  `grade` in `project.yaml` sets how much: 0 off, 1 full (still slight).
- **Music**: `music: assets/music/<track>.mp3` in `project.yaml`, ducked under speech.

## By hand

The agents' work is these commands (`npm run short -- <command> <name>`); the file
formats and editing rules are in `.claude/skills/make-short/reference.md`.

| Command | Does |
|---|---|
| `init` | the project's folders and `project.yaml` |
| `analyze` | clean voice, transcript, silences, a first guess at the cut, contact sheets |
| `check` | the plan's problems |
| `kdenlive [--force]` | `<name>.kdenlive` from `plan.yaml` (won't replace your edits without `--force`) |
| `open` | opens it in Kdenlive |
| `frame <what> <s>` | a frame of the camera, an insert, the Kdenlive cut (as Kdenlive draws it), or the video |
| `level <from> <to>` | the voice's loudness, to cut in the quiet |
| `proxy` | proxies on in the Kdenlive project, made for its footage (`kdenlive` does it too); the render uses the originals |
| `captions [--force]` | the captions made again from the cut, on Kdenlive's Subtitles track (`<name>.kdenlive.ass`) |
| `render [--sample <from> <to>]` | `out.mp4` (or `sample.mp4`) |
| `review` | checks of the video: heard against captions, sound, frames |

Costs: Whisper $0.006 a minute (the recording once, each cut once); ElevenLabs voice
isolation 1,000 credits a minute, once per recording. Needs Kdenlive (25 or newer; the
flatpak works) and a full ffmpeg (the system's, or the Kdenlive flatpak's).
