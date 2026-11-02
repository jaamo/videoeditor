# outerview-videos

Short vertical (1080×1920) product videos of Outerview, made from a script:
Playwright records the app, ElevenLabs reads the narration, Remotion zooms, adds the
cursor, clicks, spotlights, captions, title and end card, and mixes in music.

```bash
cp .env.example .env            # app URL + demo login, ElevenLabs key + voice id
npm run make -- edit-post            # → out/edit-post/en/edit-post.en.mp4
npm run make -- edit-post --lang fi  # → out/edit-post/fi/edit-post.fi.mp4
npm run studio -- edit-post --lang fi  # scrub the last build in Remotion Studio
npm run shot -- /transcripts    # screenshot a page as the demo user, before scripting it
```

The app must be running at `OUTERVIEW_URL`. Without ElevenLabs keys the video is built
silent, with placeholder timings, so a script can be worked on before spending credits.

## Caching

Narration and recordings are made once and reused, so a re-run after changing only how the
video looks (captions, cards, camera, music) goes straight to rendering.

- **Voice**: each line is cached in `cache/tts/` by its text, voice, model and neighbouring
  lines. Change a line and only that line is generated again.
- **Recording**: `out/<video>/<lang>/recording.json` and its frames are reused while the
  start page, viewport, step code, the recorder and the narration lengths are unchanged. Any
  of those changing records again by itself, so picture and voice can't drift apart.

To force it:

| Flag | Does |
|---|---|
| `--revoice` | Generate this video's narration again (a new take). The recording follows, as the lengths change. |
| `--rerecord` | Record again, keeping the narration. For when the app changed but the script didn't. |
| `--fresh` | Both. |

`rm -rf cache out` clears everything.

## A video

One file in `videos/`. Each step has a line of narration and what happens on screen while
it is said; a step lasts at least as long as its narration.

```ts
{ say: "Open the one you like.", do: (d) => d.click("text=We spent four months") }
```

The director `d` (see `Director` in `src/types.ts`) has `click`, `type`, `select` + `keys`
(edit a phrase in a text field), `highlight`, `focus`, `overview`, `hover`, `scrollTo`,
`goto`, `wait`, `cut`, and the raw Playwright `page`. Every action logs where it happened,
and Remotion moves the camera there. After a click that changes the screen, `focus` the new
thing, or the camera stays where the click was.

**Slow things** (Maya's replies, page loads): wrap the wait in `d.cut()`. It keeps
`keepMs` of it, sped up (with a "⏩ 8×" badge), or with `keepMs: 0` makes a straight cut
with a short cross-fade. Narration timing ignores the time cut out.

```ts
await d.click("button[aria-label='Send']");
await d.cut(() => d.page.getByText("Working on it…").waitFor({ state: "hidden", timeout: 150_000 }), { keepMs: 1500 });
```

**Demo data**: whatever the video changes for real is put back in `setup`, which gets
`sql` for the local app database (`OUTERVIEW_DATABASE_URL`; anything but localhost is
refused) and the demo `userId`. See `videos/edit-post.ts`.

**Interview screens**: the recording browser has a fake microphone and camera, so Maya's
mic check passes and its level meter moves.

## Voice

- **Language:** `--lang fi` picks each line's `fi` text. Lines are `"text"` or `{ en: "...", fi: "..." }`.
- **Pronunciation:** `pronounce.ts` respells words per language (`Outerview` → `Autervjuu` in
  Finnish) for the voice only; captions keep the script's spelling. Try spellings with
  `npm run say -- --lang fi "Tämä on Outerview."`.
- **Audio tags:** with `model: "eleven_v4"` (or `"eleven_v3"`) in the script, `[laughs]`,
  `[sighs]`, `[whispers]`, `[clears throat]` and the like are performed. They never show in
  captions.
- **A bad ending:** if a take ends with a stray sound, cut it by hand with the step's
  `voiceEnd: { fi: 3190 }` (ms into the clip, per language), or get a new take with `--revoice`.

## A video from your own screen recording

For a recording you made yourself (OBS or similar), narrated in your own voice:

```bash
npm run new -- my-new-project
```

A new project asks for the video's title and makes its folder, then waits for you to drop
the recording into `footage/`:

```
projects/my-new-project/
  project.yaml            title, music, captions' language and spelling fixes
  footage/                the recording (one file)
  tmp/                    everything made along the way
  my-new-project.kdenlive the cut
  my-new-project.kdenlive.ass  its captions, once added (step 3)
  out.mp4                 the video
  sample.mp4              a part of it (step 4)
```

Then the steps (a new project does 1 2 3 2 4):

1. **Initial cut**: the footage, transcribed (Whisper), without its silences (pauses over 1 s,
   found from the voice's loudness) and its retakes: a phrase said again, or started over,
   keeps only its last go; an "öö" on its own goes. A guide in Kdenlive marks each cut and
   what it took out; `tmp/initial-cut.txt` lists them all.
2. **Edit**: opens the cut in Kdenlive (25–26) to fine-tune it: trim, move, split, drop or
   bring back clips. The cleaned voice is on its own track, grouped with its picture. Save,
   and press Enter.
3. **Add captions**: the cut, transcribed, as Kdenlive's subtitles (a line each, on its
   Subtitles track), so you can fix their text in step 2. They're only for editing: the video
   draws them in its own style. Cut again after this and the voice moves under them; add them
   again (it asks first, and keeps the ones before in `tmp/`).
4. **Render**: `out.mp4`, 1920×1080, in Remotion: the intro with the title, the cut as it is
   in Kdenlive with captions and music ducked under the voice, and the end card. The
   captions are the Kdenlive ones if added, else made from the transcript as it renders. A
   line with as many words as were said keeps their timing; otherwise its words are spread
   over the line.
5. **Render a sample**: `sample.mp4`, a part of the video, to check something without
   rendering it all. It shows the video's length and asks from and to (`1:05` or `65`); Enter
   keeps the start or the end.

Run it again for a project that exists and it shows where it's at, and asks which steps to
do, in the order typed (`3 2 4`, say); nothing starts on its own. Step 1 again replaces the cut, after asking (the
one before is kept in `tmp/`).

- **Captions** are the cut's voice, transcribed in one go once it's cut (so Whisper keeps
  time), a few words at a time. `replace` in `project.yaml` fixes Whisper's spelling, also at
  the start of a hyphenated word ("Audiview-tuotteesta").
- **Sound**: the recording's voice is cleaned first (DC offset removed, the less clipped
  channel picked, level evened out) and plays instead of the recording's own track.
- **Transcription** is OpenAI's Whisper (`whisper-1`, the model that times each word): set
  `OPENAI_API_KEY` in `.env`. It costs $0.006 a minute of audio, and every transcription is
  cached in `tmp/`, so a step done again doesn't pay again. A long recording goes up in
  pieces of about 10 minutes (the API takes 25 MB at a time), each cut where it's quiet.

### Vertical, from a project file

The vertical edit of the 2026-10-19 recording is made from a hand-written list of clips:

```bash
npm run transcribe -- "screencasts/2026-10-19 16-08-24.mp4"   # → projects/<name>/transcript.txt
#   …write projects/<name>/project.yaml (Claude can draft it from the transcript)
npm run cut -- 2026-10-19-16-08-24 --studio                    # preview
npm run cut -- 2026-10-19-16-08-24                             # → out/<name>/<name>.mp4
```

- **The project file** lists the clips to keep, in order: `from`/`to` in the recording,
  `zoom` (an area in the recording's pixels, or a list of camera moves), `speed` for waits,
  plus title, end card, music and `replace` for Whisper's spelling. Comments in the file
  explain each field.
- **Captions** come from transcribing each kept clip on its own (cached in
  `projects/<name>/clips/`): over a whole recording Whisper's timings drift across silences.

### Showing clicks while recording

Run this before you start recording, so every mouse click shows a ring under the pointer:

```bash
npm run clicks                                   # pink ring, 40 px, 0.5 s
npm run clicks -- -c '#00e5ff' -r 60 -b 1        # cyan, bigger, left clicks only
```

It watches clicks on the whole screen without taking them, and the ring doesn't catch the
mouse.

**F9** (`--key` to change it) switches to drawing mode: drag to draw a rectangle around
something. Releasing the mouse (or F9) clears it and gives the mouse back. While
drawing, clicks don't show rings. The key is grabbed for the whole screen, so the app you're
recording never sees it. X11 only (Cinnamon's default session) and needs a compositor for the transparency. It
uses the system Python with GTK 3 and python-xlib (`python3-gi`, `python3-xlib`), which Mint
has installed. `--help` lists the options. Stop it with Ctrl+C.

## How it fits together

1. **voice** (`src/voice.ts`): each line → mp3 + word timings, cached in `cache/tts`.
2. **record** (`src/record.ts`): plays the steps in headless Chromium at 2×, capturing
   ~30fps screenshots and a timeline of camera, cursor, click and spotlight events.
3. **render** (`src/remotion/`): `out/<video>/manifest.json` is the props; `out/<video>` is the
   public dir.

Music: put a track at the path in the script (`assets/music/track.mp3`). It loops, fades,
and ducks under the voice.

## Title cards (landscape)

`src/remotion/titles/` has the 1920×1080 title and end cards of `npm run new`, in the look of
the app's call screen, with the logo and Outerview Serif from the marketing site
(`assets/titles/`). To work on them on their own:

```bash
npm run titles          # Remotion Studio
npm run titles:render   # → out/titles/intro.mp4, out/titles/end.mp4
```

The intro brings the title in a word at a time (400 ms each), then holds it for 3 s. Change the
title in `src/remotion/Root.tsx`, or pass `--props='{"title":"..."}'`.

The end card (4 s) is Maya's ribbon forming as on the call screen, in 1 s instead of 5, with
the logo coming up inside it. It holds 1 s, then switches off like an old TV in 2 s: the ring
is squashed into a horizontal line across the screen, the background goes black, the line
goes out, then the logo.
`src/remotion/titles/Ribbon.tsx` is a port of the app's 2D ribbon (`voice-wave-2d.tsx`), driven by the
frame and a made-up calm voice.
