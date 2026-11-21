# Video project reference

Everything the video agents share. A project is registered as `projects/<name>/project.yaml`
(its settings); everything made about it (analysis, transcripts, findings, plans, build files)
lives with the footage, in `<source>/editor/`, so it travels with the footage; every step
reads and writes files there, so any of them can be read, fixed by hand, or done again on
its own. The footage itself stays where it was dropped (`project.yaml`'s `source`): Resolve
links to it there. Only the remakeable voice WAVs stay in `projects/<name>/cache/`.

## The video

A full-length talking-head video for Kampiapina, 1920×1080 at the A-roll's frame rate, cut
in DaVinci Resolve. The agents make the first cut; the user finishes it in Resolve
(grade, sound, render). No captions, no markers.

- **A-roll**: the talking head, the recording the cut follows. Usually one file.
- **B-roll**: other footage, cut in over the A-roll while the words are about what it shows.
- **Rough cut**: the A-roll in its recorded order, with pauses, retakes, false starts,
  fillers and asides taken out.
- **Jump cuts**: two pieces of the same shot joined jump. A join is hidden by b-roll over
  it, or by a **punch-in** (the piece after the join zoomed, like a second, closer camera:
  ×1.24 on a wide talking-head shot, ×1.18 on a POV or chest-cam shot), alternating wide
  and close along the cut.
- **Colour groups**: every clip goes into its camera's group of the Resolve project
  (Lumix, DJI, GoPro), read from the file's metadata; the groups carry the colour
  transform. The project is made from the Kampiapina template, which has them.
- **Titles**: from the template's Brand/Titles bin, always cut the same way (see the rules):
  the **main title** ("Main title 2026", a timeline with its jingle) after the intro, then
  "Social links", then "Music by Kampiapina" (though the music is already playing), and the
  **end title** over the sign-off. `plan.yaml`'s `titles` says where the main and end
  titles go; `project.yaml`'s `titles` names other compositions or drops one.
- **Music**: the file in `project.yaml`'s `music`, under it all at `musicDb` (-18 dB),
  faded in and out, from just before the main title to the end of the end title.

## The phases

1. **First cut, by the agents**: sort, ingest into Resolve (footage, music, the A-roll
   transcribed by Resolve), analyze, plan (`plan.yaml`), build the timeline.
2. **The user, in Resolve**: everything after. The timeline is the truth then.

A re-edit before the user has touched the timeline (they say "move that insert", not "I
edited it"): change `plan.yaml`, build again with `--force` (the old timeline is renamed
"<name> (old N)", not deleted). Once they've edited in Resolve, don't rebuild unless they
ask, knowing what that does.

## Commands

All from the folder `kampiapina-videos/`, `npm run -s video -- <command> <name> …`:

| Command | Does |
|---|---|
| `init <name> <source folder> [--project <Resolve project>]` | `project.yaml`: where the footage is (the folder, or a `footage/` folder in it), the music found there, the Resolve project (default: the name) |
| `sort <name> [<file>=aroll\|broll\|skip …]` | without roles: each video not yet given one, with size, length, sound, camera and a contact sheet (`analysis/sort/`). With a role for every one: writes them to `project.yaml` |
| `analyze <name> [--force]` | per A-roll file: the mastered voice, silences, the transcript as text, a first guess at the cut; contact sheets of every file; `summary.json`. Skips what's done. Needs the transcript from `mcp ingest` for the text and the guess |
| `frame <name> <file> <seconds> [x,y,w,h]` | one frame of a footage file (`file` as in summary.json), at its own size, with the box drawn |
| `level <name> <from> <to> [file]` | the voice's loudness (dBFS) every 50 ms, at most 30 s: where a word really starts and ends. Speech is about -20, quiet under -45; a cut where it's over -38 is heard |
| `sync <name> [<b-roll file> …] [--at <offset>] [--any]` | two cameras: the clock offset between them from the sound (each b-roll clip against the other camera's A-roll, looked for within 90 min of the two cameras' first files, `--any`: anywhere; `--at`: score a given offset too). Prints the candidate offsets with their evidence (which clip pairs correlate); confirm the best one with a sentence both cameras caught or a frame of each at the same moment, then put it in `project.yaml`'s `clocks` and `analyze` again. With `clocks` set, says per b-roll clip whether the A-roll was rolling then (a second angle) or not (talk only it has: sort it `aroll`) |
| `merge <name>` | `plan.part1.yaml` … `plan.partN.yaml` (a long video planned in parts) into `plan.yaml`, titles from the first and last part |
| `check <name> [--plan <file>]` | the plan's errors and warnings, and what each segment says (`--plan`: a part of it) |
| `build <name> [--force]` | the plan as `tmp/build.json` (and the timeline template), and prints the Resolve script to run |
| `broll <name> [--max-len 10] [--gap 4] [--shift 240] [--talk]` | a b-roll pass on the timeline as it is (after `mcp dump`): the usable sections of the second camera (`analysis/broll-sections.json`, or `broll-sections.partN.json` merged) placed on V2 by real time, each where the A-roll shot at the same moment sits in the cut, in the first free slot, in ride order; writes `tmp/broll.json` and lists it. Stretches already in the cut (on any video track), the first 3 s, the main title's gap and the end are left alone; ride order is kept around what's on V2, doubles and items out of order already there are reported; sections over `--max-len` s are cut to it; `--talk` keeps sections where the user talks to the camera |
| `mcp <name> <ingest [--all]\|build\|dump\|still\|broll> …` | prints the Python for the Resolve MCP (below); `ingest --all` transcribes the b-roll too, to find talk in it |

## Resolve, through the MCP

What the API does and doesn't do (frame rates, frames, transcription, rotation tags, the
MCP's timeout) is in [resolve.md](resolve.md): read it before changing a script.

The scripts in `src/resolve/` run inside Resolve: `npm run -s video -- mcp <name> <script>`
prints a few lines of Python, which go to the `mcp__DaVinci_Resolve__run_script_unsafe`
tool as they are (timeout 60). Resolve must be running; the script opens the project
named in `project.yaml` if another is open.

| Script | Does |
|---|---|
| `ingest` | imports the footage into the Footage bin and the music into Music, sets the transcription language, transcribes each A-roll file and writes `analysis/<stem>.transcript.json` (words in ms of the file). Transcribing a long clip outlasts the MCP's timeout: Resolve goes on in the background, so **run it again** after a minute until `written` lists every A-roll file and `pending` is empty |
| `build` | the timeline from `tmp/build.json` (after `build <name>`). Refuses to replace a timeline of that name without `force` |
| `dump` | the timeline as it is now, to `tmp/timeline.json` (every item: where, which frames of which file, group, zoom) |
| `still <seconds>` | a frame of the cut as Resolve shows it, to `analysis/frames/cut-<s>.png` |
| `broll` | appends `tmp/broll.json` (from `broll <name>`) on video track 2: picture only, turned as planned, in the camera's colour group; nothing else is touched. Writes `tmp/broll.result.json` as it goes |

## Time

`analysis/`, `plan.yaml`, `frame` and `level` are in **seconds of the A-roll file**. An
insert's `from` and `frame <b-roll file>` are in seconds of that file. `check`'s listing,
`still` and the dump are in **seconds of the cut**.

## Files

```
projects/<name>/
  project.yaml          source, resolve {project, timeline}, language, music, musicDb, titles, roles, clocks
  cache/<stem>.voice.wav   the A-roll's voice, mastered (analysis only: Resolve plays the camera's sound); remakeable, kept out of the synced footage folder
<source>/editor/        with the footage (project.yaml is copied here too)
  analysis/
    summary.json        the timeline's fps, every A-roll and b-roll file (size, fps, length, camera, group, shotAt/realAt)
    chronology.txt      every clip in real time (the cameras' clocks corrected by project.yaml's clocks), with length and words
    <stem>.transcript.json   every word: { text, startMs, endMs } (from Resolve, via mcp ingest)
    <stem>.transcript.txt    the same as phrases: [start–end] text, in seconds
    <stem>.silences.json     where the voice is quiet: exact places to cut
    <stem>.cuts.json         a first guess, by loudness and repeated phrases: keep ranges, and removed ones with why
    sheets/             contact sheets of every file; index.txt gives each tile's time
    frames/             frames from the frame command, and cut-<s>.png from still
    findings.md         the analyzer's notes (it returns them, the skill saves them)
    broll-sections.json / broll-sections.partN.json   every usable section of the b-roll, for a b-roll pass: [{ file, from, to, rotation, what, talk? }] in seconds of the file; rotation 0 / 90 / -90 / 180 is what the picture needs to stand upright; talk marks the user talking to that camera
  plan.yaml             the first cut
  tmp/                  build.json, timeline.fcpxml, timeline.json
```

## plan.yaml

```yaml
# Seconds of the A-roll file, as 83.4 or "1:23.4".
segments:                 # played in this order, one after another
  - from: 12.30
    to: 16.85
    why: the opening
    file: P1004769.MOV    # only when there's more than one A-roll file
    zoom: 1.18            # a punch-in (1.24 on a wide talking-head shot); 1 (default) as shot. Alternate across uncovered joins
    rotation: 180         # when this stretch is upside down (a chest cam's file tagged 180°, taken in the hand and turned to the face); inserts take it too
    inserts:
      - file: P1004770.MOV   # a b-roll file, as in summary.json
        at: 13.0          # A-roll seconds: seen while this is said
        until: 16.5
        from: 4.2         # seconds into the b-roll's own file (default 0)
        why: the chain he's talking about
titles:                   # seconds of the A-roll, inside a segment
  main: 20.94             # the pause after the intro has said what the video is about: the talk stops here for the main title
  end: 941.60             # where the sign-off starts: the end title plays over it
  # with several A-roll files, say which:  end: { file: P1004771.MOV, at: 941.60 }
```

## Editing rules

- **Order as recorded.** It's a talk: no reordering, no hook moved to the front. Cut
  out, don't rearrange.
- **Tight, but a talk**: pauses over ~0.3 s out, retakes (keep the last, best take), false
  starts and restart words, fillers (öö, ää, niinku on its own, "niin sanotusti"), slips,
  asides, anything said to someone else, the clap or slate at the start, mic checks. A
  breath between sentences stays. This tightness is always wanted: a wish like "keep most
  of the talking, only cut the duplicates" is about the content (asides, rants, ride
  chatter stay for the user to decide), never a reason to leave pauses, fillers or stumbles in.
- **Cut in the quiet**: find each cut from the words' times (`transcript.json`), then put it
  in the quiet before the first sound and after the last, by the voice itself
  (`silences.json`, or `level` around the edge). Leave ~0.05 s before the sound and ~0.15 s
  after. `check` warns about every cut where the voice is loud: none should be left.
- **Hide every join**: where two A-roll pieces meet with no b-roll over the join, the
  piece after it gets a different zoom from the piece before: wide (1), punched in (1.24
  on a wide talking-head shot, 1.18 on POV), wide, … `check` warns about a join left as a jump. A piece keeps one zoom; don't flip
  zoom inside a sentence for no reason. The first piece is wide.
- **Inserts**: where the words are about something the b-roll shows, while it's talked
  about, 2–8 s each; and over joins, which they hide. Pick the stretch of the b-roll that
  shows the thing (contact sheets, `frame <file> <s>`). Not over the first 3 s: the viewer
  sees the speaker first. **Never use the same stretch of b-roll twice**, nor a stretch that
  is already in the cut on another track (a ride clip with talk on V1 shows its picture
  there): the viewer notices footage they have seen. `check` rejects an insert that repeats
  another's stretch; `broll` skips what is on any video track. **The video is chronological**,
  the b-roll too: an insert is never from before the insert before it (by the files' real
  times), whatever the words would want; `check` rejects an insert out of ride order, `broll`
  keeps order around what is on V2 already and skips a section that has no room in order. Use the b-roll
  generously on a ride (POV talk is one picture for an hour): about one insert every 20–30 s
  of talk where there is footage, the same stretch of the ride first.
- **The ride cam's angles are deliberate.** The user clamps the second camera under the
  handlebar or holds it low and lets it run: the road rolling under the bike with a leg in
  frame, the bottle and bags from below, the sky and treetops through the frame, the bike
  in the grass. These are shots, not accidents, and they come out upside down or sideways:
  judge them after the rotation they need (`frame`, then look at it turned) and name it;
  the planner sets `rotation: 180` (or 90 / -90) on the insert. Only a lens covered by a
  glove, a blur or a swing is unusable.
- **Vertical shots.** Some clips are shot with the camera held upright: the whole file is a
  vertical video stored as a 16:9 frame lying on its side (the horizon runs up the frame,
  the road from side to side; the top of the scene points left or right in every tile).
  Identify these per file, not per stretch: every section of such a file gets the same
  `rotation` (90 or -90), none stays 0. Turned up, the picture would stand as a pillar, so
  the tool zooms it to fill the frame (1.778, the frame's aspect, on top of any punch-in):
  the middle of the tall picture is what shows, judge the shot by its middle. From a 4K file
  the fill is sharp; from 1080p a little soft, still better than a pillar.
- **The intro and the main title**: the talk opens with "Morjesta pöytään" and one or two
  sentences on what the video is about; then the main title (`titles.main`): the talk
  stops in the quiet after that sentence, the title plays (4.75 s, its jingle already
  running under the intro), and the talk goes on from the same frame. Usually 5–15 s into
  the cut. Keep the intro as one piece (no insert across the title point).
- **The other titles** need no planning: Social links comes 16 s after the main title,
  Music by Kampiapina 5 s after it (in that order, always, even though the music started
  before the main title).
- **The end title** (`titles.end`) starts where the sign-off starts ("kiitos ku katsoit",
  "moro", "nähdään ensi videolla"…), plays over it, and runs 12 s, past the last word. So
  the sign-off should be 4–10 s of talk. Without `titles.end`, it starts 8 s before the
  end.

## Several A-roll files, two cameras, a long ride

Learned on `tekoaly-ja-politiikka` (a chest cam + a hand-held ride cam, 97 clips, 2 h 50 min):

- **Roles**: a b-roll camera's clip in which the user talks to that camera (words the A-roll
  doesn't have) is A-roll (`aroll`), placed at its real time among the other files. Find
  them by transcribing everything (`mcp <name> ingest --all`) and running `sync`: a b-roll
  clip with the same words as the A-roll is a second angle, b-roll.
- **Clocks**: the cameras' clocks can disagree (a chest cam ran 14 h 23 min ahead). `sync`
  finds the offset from the sound and says which b-roll clips have talk the A-roll
  doesn't; confirm the offset with a sentence both cameras caught or a frame of each at
  the same moment, put it in `project.yaml` (`clocks: [{ match: "1920x1080", offset:
  "+14:23:00" }]`), and `analyze` writes every clip in real time to
  `analysis/chronology.txt` (also `shotAt`/`realAt` in summary.json).
- **Rotation**: Resolve applies a file's 180° tag (a chest cam worn upside down shows its
  POV upright) but not a ±90° one (`rotationFor()` turns those). Inside a 180°-tagged file
  the stretches where the camera is taken in the hand and turned to the face come out
  upside down or sideways: each such segment gets `rotation: 180` (or 90 / -90, by which
  way the head points in a `frame`).
- **Parts**: over about 30 min of A-roll, split the files into chronological parts of
  25–40 min and run one analyzer and one planner per part in parallel. Each planner
  writes `plan.partN.yaml` (every segment with `file:`), checks it with `check --plan`,
  and does not build; the first part sets `titles.main`, the last `titles.end`, both as
  `{ file, at }`. Then `merge`, `check`, `build` once, `dump`, stills.
- **A b-roll pass later**: once the user has cut the A-roll by hand, b-roll is added without
  touching V1: `mcp dump` (the timeline as it is), the analyzer lists every usable section of
  the second camera with its rotation (`broll-sections.json`, in parts for many files), then
  `broll` places them on V2 by real time (a ±90° section with the fill zoom) and `mcp broll` appends them. Run it again after
  more sections are found: what's in the cut already, on any video track, is skipped, so no
  stretch is ever used twice, and every section lands after the V2 items shot before it and
  before those shot after, so the ride stays in order (a section with no room there is skipped).
- **Wind**: on a bike the voice track never goes quiet, so `silences.json` is empty and
  `check` warns "voice is loud" at every cut: cut by the word times and accept those
  warnings; the face stretches (camera near the mouth) do have real quiet.

## The Resolve timeline

Tracks: **V1 A-roll** (each piece with its voice linked on **A1 Voice**; a punched-in piece
has Zoom 1.18 in the Inspector's Transform; a gap where the main title plays), **V2 B-roll**
(picture only), **V3 Titles** (the main title's picture in the gap, Social links, Music by
Kampiapina, and the end title over the last piece), **A2 Music** (the track at `musicDb`,
with fades), **A3 Jingle** (the main title's sound, whole, at -10.5 dB, starting 4.75 s
before its picture). Every clip is in its camera's colour group (Color page). The
timeline has its own frame rate (the A-roll's) and 1920×1080, whatever the project's.
