# Short project reference

Everything the short agents share. A project is `projects/<name>/`; every step reads and
writes files there, so any of them can be read, fixed by hand, or done again on its own.

## The short

1080×1920 (vertical), at the camera's frame rate (halved when it's over 30). No intro, no
outro: it starts on the first word and ends on the last.

- **Camera**: the main recording, usually 4K. Its 9:16 crop is placed by `framing` (where
  the speaker is), filling the frame.
- **Emphasis zooms**: at most two on a short, on its strongest lines. A hard cut to closer
  (×1.15–1.3), no animation, held while the phrase is said, and a hard cut back; or held
  until the cut, when the phrase runs to the segment's end.
- **Inserts**: b-roll or a screen recording over the camera while the voice goes on.
  `full` (b-roll's default) fills the frame, around a `box` of it if given; `fit` (screen's
  default) shows all of it across the frame's width, over a blurred, dimmed fill of itself.
- **Captions**: a few big white words at a time, low in the middle; the word being said on
  a block of the brand red (#911B1B).
- **Look**: warm, faded, a little desaturated, a soft vignette and fine grain
  (`grade` in project.yaml, 0–1).
- **Sound**: the camera's voice, cleaned (ElevenLabs voice isolation, then mastered to
  -16 LUFS), and music if set, ducked under speech. An insert with `sound` is heard too
  (its own audio, on the "Insert sound" track): for an example the talk is about, e.g. a
  screen recording playing music, placed where the speaker is quiet so it has room.

## The three phases

1. **First cut, by the agents**: analyze, plan (`plan.yaml`), and make `<name>.kdenlive`
   from it. The plan is done with then.
2. **Fixing the cut, by the user, in Kdenlive**: timings, cuts, inserts, zooms. No captions
   or grade there: just the cut.
3. **Finishing, by the agents**: captions of the cut as it is now (`captions.txt`, text
   fixed), render, review. Everything is read from the `.kdenlive`: **after phase 1 the
   Kdenlive project is the truth, not plan.yaml.** Never rebuild it (`kdenlive --force`)
   once the user has edited it, unless they ask: it throws their edits away.

## Commands

All from the folder `kampiapina-shorts/`, `npm run -s short -- <command> <name> …`:

| Command | Does |
|---|---|
| `init <name>` | makes the folders and `project.yaml` |
| `sort <name> [<file>=camera\|broll\|screen\|skip …]` | without roles: the files dropped in the project and not yet in `footage/`, each with size, length, sound and a contact sheet (`analysis/sort/`). With a role for every one: moves them into place |
| `analyze <name> [--force]` | clean voice, transcript, silences, a first guess at the cut, contact sheets. Skips what's done for the same footage |
| `frame <name> <what> <seconds> [x,y,w,h]` | one frame as an image at the file's own size, with the box drawn. `what`: `main` (the camera), `broll/<file>`, `screen/<file>` (seconds of that file), `cut` (the Kdenlive project as Kdenlive draws it: framing, zooms, inserts; seconds of the cut), `out`/`sample` (seconds of the video) |
| `level <name> <from> <to>` | the clean voice's loudness (dBFS) every 50 ms, at most 30 s: where a word really starts and ends. Speech is about -20, quiet under -45; a cut where it's over -38 is heard |
| `check <name>` | the plan's errors and warnings, and what each segment says |
| `kdenlive <name> [--force]` | `<name>.kdenlive` from the plan. Refuses to replace one that's there unless `--force` (which keeps the old one in `tmp/`) |
| `open <name>` | opens the project in Kdenlive |
| `captions <name> [--force]` | the cut's voice transcribed, to `captions.txt`. Does nothing if it's for this cut already; for a changed cut it makes it again (the old one kept in `tmp/`) |
| `render <name> [--sample <from> <to>]` | `out.mp4`, or `sample.mp4` of seconds of the video. Refuses if `captions.txt` is for an earlier cut |
| `review <name> [--sample]` | checks of the video: `review/report.md` and `review/sheet-*.jpg` |

## Time

`analysis/`, `plan.yaml` and `frame main` are in **seconds of the camera recording**. An
insert's `from` and `frame broll/…` are in seconds of that file. `captions.txt`, `frame
cut`, the render and the review are in **seconds of the cut** (= of the video).

## Files

```
projects/<name>/
  project.yaml          language (fi), music, musicVolume, grade (0–1), replace (caption spelling fixes)
  (anything dropped)    files dropped here are sorted into footage/ by `sort`; skip → unused/
  footage/              the camera recording: one file
    broll/              b-roll clips (and stills), any number
    screen/             screen recordings, any number
  analysis/
    summary.json        the camera (size, fps, length), every insert, the short's fps
    voice.wav           the clean voice (voice.isolated.wav: ElevenLabs' take; voice.refused.txt:
                        ElevenLabs refused the key, not asked again until it's deleted)
    transcript.json     every word: { text, startMs, endMs }, camera ms (gaps Whisper left out
                        filled: transcript-gaps.json)
    transcript.txt      the same as phrases: [start–end] text, in seconds
    silences.json       where the clean voice is quiet: exact places to cut
    cuts.json           a first guess, by loudness and repeated phrases: keep ranges, and removed
                        ones with why. A starting point, not the plan
    sheets/             contact sheets of the camera and each insert; index.txt gives each tile's time
    frames/             frames taken with the frame command
    findings.md         the analyzer's notes (it returns them, the skill saves them)
  plan.yaml             the first cut (phase 1)
  <name>.kdenlive       the cut (phases 2 and 3)
  captions.txt          the captions (phase 3)
  review/, review.md    the reviewer's checks and verdict
  tmp/                  everything else (manifest.json is what was rendered)
  out.mp4, sample.mp4
```

## plan.yaml

```yaml
# Seconds of the camera recording, as 83.4 or "1:23.4".
framing:                  # where the speaker is, camera pixels: the crop's middle
  x: 1850
  y: 900                  # optional: a little below the eyes; lands 30 % down the frame (default: the camera's middle, in the middle)
  zoom: 1.0               # optional: 1 fills the frame's height; more is closer all the time
segments:                 # played in this order, one after another
  - from: 12.30
    to: 16.85
    why: the hook
    framing: { x: 1700 }  # optional, this segment only (the speaker moved)
    emphasis:             # a hard cut closer on what matters; two on the whole short at most
      - at: 14.10         # cuts in here
        until: 16.85      # cuts back here (at the segment's end: holds to the cut)
        zoom: 1.18        # optional, default 1.15
        why: the punchline
    inserts:
      - file: broll/trail.mp4   # as in summary.json's inserts
        at: 13.0          # camera seconds: seen while this is said
        until: 15.5
        from: 4.2         # seconds into the insert's own file (default 0)
        look: full        # full | fit (default: full for broll/, fit for screen/)
        box: [800, 300, 1600, 900]  # full only: what of it to show, its own pixels
        sound: 1          # optional: its own audio heard at this gain (1: as recorded); default silent
        why: shows the trail he's talking about
```

## Editing rules (phase 1)

- **The hook first**: the short opens on its strongest line, in the first second or two. No
  greeting unless it's the hook. If the strongest line comes later in the recording, it
  may be moved to the front (the only reordering allowed); otherwise keep the order.
- **Tight**: every pause over ~0.3 s out (shorts move fast), retakes (keep the last, best
  take), false starts, fillers (öö, ää, niinku on its own), asides, anything said to
  someone else. 60 s at most unless the user says otherwise; shorter is better.
- **Cut in the quiet**: find each cut from the words' times (`transcript.json`), then put it
  in the quiet before the first sound and after the last, by the voice itself
  (`silences.json`, or `level` around the edge). Whisper's times are a guide only: a word's
  start is often 0.2–0.35 s late, and a word is stretched over a pause sometimes. Leave
  ~0.05 s before the sound and ~0.12 s after. `check` warns about every cut where the voice
  is loud: none should be left.
- **Framing**: the speaker's face high in the frame, clear of the captions (they start
  1210 px down): `framing.x` the middle of the face (camera pixels), `framing.y` a little
  below the eyes, which the crop puts 30 % down the frame (as far as the camera allows: at
  zoom 1 a 9:16 camera can't move, so zoom in a little, 1.15–1.25, to give it room). Check it with
  `frame <name> cut <seconds>` after making the project. Set it per segment if the speaker
  moves.
- **Emphasis zooms: two at most on the whole short** (`check` refuses more), on its two
  strongest lines (the hook, the punchline), each a hard cut in and out held over its
  phrase (1–4 s), `zoom` 1.15–1.3. None is fine. Not while a `full` insert hides the camera.
- **Inserts**: where the words are about something b-roll or a screen recording shows,
  while it's talked about, 1.5–5 s each. Also good over a jump cut (two camera pieces
  that join badly): an insert across the join hides it. Pick the stretch of the insert
  that shows the thing (contact sheets, `frame broll/… <s>`), and for `full` a `box` near
  9:16 around what matters. A 1080p landscape clip filling the vertical frame is soft:
  `check` says so; prefer `fit`, or 4K b-roll.
- **Captions** come later, from the cut: the plan has nothing to do with them, except
  spelling fixes for project.yaml's `replace` (from the findings).

## The Kdenlive project

Tracks, bottom to top: **Voice** (the clean voice, each piece grouped with its camera
piece), **Camera** (each piece with its Transform: framing and emphasis keyframes, held
("discrete": a zoom is a hard cut)), **Backdrop** (the blurred fill behind `fit` inserts), **B-roll / screen**.
A guide at each piece says why it's there.

What the render takes from it, as it is when rendering: every clip of every video and
audio track (hidden or muted tracks left out), where it is and which part of its file;
each clip's **Transform** (its keyframes, any easing), **Gaussian blur** and **Brightness**;
a track's Transform; speed changes; on sound, fades and Volume. Anything else made in
Kdenlive (other effects, titles, transitions between clips) isn't rendered: `render`
warns about each. Images work as clips. Captions and the grade are added by the render, so
Kdenlive shows the cut without them.
