# Video project reference

Everything the video agents share. A project is `projects/<name>/`; every step reads and
writes files there, so any of them can be read, fixed by hand, or done again on its own.

## The video

1920×1080, 30 fps:

1. **Opening title** (`titles.yaml`): the title a word at a time, an optional subtitle,
   on the call screen's red backdrop. 0.4 s a word, then 3 s.
2. **The cut** (`plan.yaml`), in two layouts:
   - `face`: the face camera alone, full height in the middle, black at the sides. For the
     intro (hello, what this is) and the outro (the wrap-up, goodbye).
   - `screen`: the screen recording filling the frame, the face small in the bottom right
     corner (400 px tall, 40 px in). Everything in between. Zooms happen here.
   Changing layout animates over 0.7 s from the cut: the face moves between the middle
   and its corner, the screen fades. Captions run under it all (a few words at a time,
   bottom middle, 1200 px wide at most, so clear of the face's corner).
3. **End card**: Maya's ribbon, the logo, an optional line under it (`endLine`), 4 s.

Music runs under everything, ducked while someone speaks. The voice is the main
recording's, cleaned (ElevenLabs voice isolation, then mastered to -16 LUFS).

## Commands

All from the repository root, `npm run -s video -- <command> <name> …`:

| Command | Does |
|---|---|
| `init <name>` | makes the folders and `project.yaml` |
| `analyze <name> [--force]` | voice, transcript, sync, screen events, contact sheets. Skips what's done for the same footage |
| `frame <name> <screen\|face\|out\|sample> <seconds> [x,y,w,h]` | one frame as a JPEG at the recording's own size (so a point on it is in its pixels), with the box drawn. Seconds of the main recording for screen/face, of the video for out/sample |
| `level <name> <from> <to>` | the clean voice's loudness (dBFS) every 50 ms, at most 30 s: where a word really starts and ends. Speech is about -20, quiet under -45; a cut where it's over -38 is heard |
| `titles <name>` | stills of the opening title and the end card, to `tmp/titles-*.png` |
| `check <name>` | the plan's errors and warnings (a cut where the voice is loud, among them), and what each segment says |
| `render <name> [--sample <from> <to>]` | `out.mp4`, or `sample.mp4` of seconds of the video |
| `review <name> [--sample]` | checks of the video: `review/report.md` and `review/sheet-*.jpg` |
| `comments <name> [--sample] [--port 4321]` | a page to watch the video in and comment on moments of it, saved to `comments.yaml`. Runs until stopped |

## Time

Everything in `analysis/`, `plan.yaml` and the `frame` command for screen/face is in
**seconds of the main recording**: the face camera's when it has sound, else the screen's
(`analysis/summary.json` says which, and where the other one starts in that time:
`startMs`, negative if it started first). The review is in seconds of the finished video
(the opening title first).

The other recording is placed by matching the sound of the two: `syncConfidence` is how far
the best match stands out, over 8 clear, under 5 worth checking by eye (a click, a page
change, seen in both at the same moment).

## Files

```
projects/<name>/
  project.yaml          language (fi), music, musicVolume, replace (caption spelling fixes)
  footage/              the recordings: a vertical one is the face, a landscape one the
                        screen (or named …face… / …screen…). Either may be missing.
  analysis/
    summary.json        which recording is main, sizes, durations, where each starts, sync confidence
    voice.wav           the clean voice (voice.isolated.wav: ElevenLabs' take, if it was made;
                        voice.refused.txt: ElevenLabs refused the key, not asked again until
                        it's deleted)
    transcript.json     every word: { text, startMs, endMs }, main recording's ms. Whisper
                        leaves out stretches sometimes; those are transcribed again and put in
                        (transcript-gaps.json lists them; transcript.whisper.json is the first go)
    transcript.txt      the same as phrases: [start–end] text, in seconds
    silences.json       where the clean voice is quiet (under -40 dB for 0.25 s or more): exact
                        places to cut, also where Whisper stretched a word over a pause
    cuts.json           a first guess, by loudness and repeated phrases: keep ranges, and removed
                        ones with why. A starting point, not the plan
    screen-events.json  clicks (click rings of npm run clicks), changes (most of the screen
                        changed: a new page), activity (one area changing for a while), with
                        boxes [x, y, w, h] in the screen recording's pixels
    sheets/             contact sheets of each recording; index.txt gives each tile's time
                        (the first frame at or after it)
    frames/             frames taken with the frame command
    findings.md         the analyzer's notes (it returns them, the skill saves them)
  titles.yaml           title, subtitle, endLine
  plan.yaml             the edit
  review/               report.md, heard.json, sheet-*.jpg, frames/
  review.md             the reviewer's verdict and fixes (saved by the skill, like findings.md)
  comments.yaml         the user's comments from the comments page: t (seconds of the video), at,
                        where, segment, recording (seconds of the main recording), text, done
  tmp/                  everything else (manifest.json is what was rendered)
  out.mp4, sample.mp4
```

For a look of your own, the scripts' ffmpeg is the system's if there is one, else
Kdenlive's flatpak's: `flatpak run --command=ffmpeg org.kde.kdenlive …` (it sees the home
folder, not /tmp). `npx remotion ffprobe` reads any file.

## titles.yaml

```yaml
title: Outerview kahdessa minuutissa   # 2–5 words, in the video's language
subtitle: Haastattelusta postaukseksi  # optional, up to ~6 words
endLine: outerview.app                 # optional, one short line on the end card
opening: false                         # optional: leave the opening title card out
```

## plan.yaml

```yaml
# Seconds of the main recording, as 83.4 or "1:23.4".
segments:                 # played in this order, one after another
  - from: 22.2
    to: 27.4
    layout: face          # face | screen
    why: hello, what this is
  - from: 30.1
    to: 42.7
    layout: screen
    why: the start page
    zooms:                # screen segments only; inside the segment
      - at: 36.0          # starts zooming in here (0.8 s to settle)
        until: 41.0       # starts zooming back out here
        box: [560, 140, 900, 260]   # what to show, screen recording pixels [x, y, w, h]
        why: where a new interview starts
  - from: 207.65
    to: 211.3
    layout: face
    text: Nämä haastattelut voivat olla pitkiä tai lyhyitä, niistä voi tulla useita sisältöjä.
                          # optional: the captions as said, when the transcript has them wrong;
                          # spread over the time the transcript's words took
    sound: screen         # optional: this piece's sound from the screen recording instead of
                          # the voice: for what the computer played (Maya speaking), faint
                          # or filtered out of the face camera's
replace:                  # optional, caption spelling fixes on top of project.yaml's
  Autervju: Outerview
musicVolume: 0.1          # optional, music level under speech
```

## Editing rules

- **Shape**: intro on `face` (the greeting and what the video is about), the body on
  `screen`, the outro on `face` (the wrap-up: what it was, what to do next). Words about
  something happening on screen (a click, a new page, "let's check the mics") are body, on
  `screen`, wherever they come: the outro is only what's said to the viewer. If there's no
  such wrap-up, the video ends on `screen`. Without a face recording everything is
  `screen` (no corner face); without a screen recording everything is `face`.
- **Cut in the quiet**: find each cut from the words' times (`transcript.json`), then put it
  in the quiet before the first sound and after the last, by the voice itself
  (`silences.json`, or `level` around the edge). Whisper's times are a guide only: a word's
  start is often 0.2–0.35 s late (a "ts", a "t" before the vowel), and a word is stretched
  over a pause when talking while typing. Leave ~0.1 s of quiet before the sound and
  ~0.2 s after. `check` warns about every cut where the voice is loud: none should be left.
- **Caption text**: where the transcript is wrong over a whole stretch (a gap transcribed
  again, a mumbled take), give the segment `text`; for a word wrong everywhere, `replace`.
- **Captions** follow the words: a word's caption goes with the segment holding most of it,
  and a word cut out entirely has none. `check` prints each segment's words: what it prints
  is what's captioned.
- **Take out**: pauses over about 0.8 s (end the segment, start a new one), retakes (keep the
  last, best take), false starts, lone fillers (öö, ää, niinku on its own), long waits on
  screen with nothing said, anything said off topic or to someone else.
- **Keep the order** of what was said unless moving something clearly helps; never repeat a
  stretch.
- **Zooms**: on what's being talked about or clicked, while it's talked about. Hold 1.5–6 s
  (`until - at`), not in the first 0.8 s of a screen segment that follows a face one (the
  layout is still changing), at most one every ~6 s, and not when the whole screen matters.
  The zoom is `min(0.8 × 1920 / w, 0.75 × 1080 / h)` (for a 1920×1080 screen), capped at
  2.2× (more looks soft): a box smaller than about 700×370 gets 2.2× and shows more around
  it. Keep boxes near 16:9. Check one with `frame <name> screen <seconds> x,y,w,h`.
- **The face's corner** covers the bottom right of the frame (about 225×400 px, 40 px in)
  on `screen`. A zoom on something in the screen's own bottom-right corner keeps it there,
  under the face: `check` warns when the face covers a zoomed box. Zoom on something else,
  or not at all.
- **Layout changes** are moments: put them where the talk turns (from the intro to the
  demo), not mid-sentence.
- **Length**: what it takes, nothing more. A demo of a few minutes beats a long one.
