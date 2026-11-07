# Video project reference

Everything the video agents share. A project is `projects/<name>/`; every step reads and
writes files there, so any of them can be read, fixed by hand, or done again on its own.
The footage itself stays where it was dropped (`project.yaml`'s `source`): Resolve links to it there.

## The video

A full-length talking-head video for Kampiapina, 1920×1080 at the A-roll's frame rate, cut
in DaVinci Resolve. The agents make the first cut; the user finishes it in Resolve
(grade, sound, render). No captions, no markers.

- **A-roll**: the talking head, the recording the cut follows. Usually one file.
- **B-roll**: other footage, cut in over the A-roll while the words are about what it shows.
- **Rough cut**: the A-roll in its recorded order, with pauses, retakes, false starts,
  fillers and asides taken out.
- **Jump cuts**: two pieces of the same shot joined jump. A join is hidden by b-roll over
  it, or by a **punch-in** (the piece after the join zoomed ×1.18, like a second, closer
  camera), alternating wide and close along the cut.
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
| `check <name>` | the plan's errors and warnings, and what each segment says |
| `build <name> [--force]` | the plan as `tmp/build.json` (and the timeline template), and prints the Resolve script to run |
| `mcp <name> <ingest\|build\|dump\|still> …` | prints the Python for the Resolve MCP (below) |

## Resolve, through the MCP

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

## Time

`analysis/`, `plan.yaml`, `frame` and `level` are in **seconds of the A-roll file**. An
insert's `from` and `frame <b-roll file>` are in seconds of that file. `check`'s listing,
`still` and the dump are in **seconds of the cut**.

## Files

```
projects/<name>/
  project.yaml          source, resolve {project, timeline}, language, music, musicDb, titles, roles
  analysis/
    summary.json        the timeline's fps, every A-roll and b-roll file (size, fps, length, camera, group)
    <stem>.voice.wav    the A-roll's voice, mastered (analysis only: Resolve plays the camera's sound)
    <stem>.transcript.json   every word: { text, startMs, endMs } (from Resolve, via mcp ingest)
    <stem>.transcript.txt    the same as phrases: [start–end] text, in seconds
    <stem>.silences.json     where the voice is quiet: exact places to cut
    <stem>.cuts.json         a first guess, by loudness and repeated phrases: keep ranges, and removed ones with why
    sheets/             contact sheets of every file; index.txt gives each tile's time
    frames/             frames from the frame command, and cut-<s>.png from still
    findings.md         the analyzer's notes (it returns them, the skill saves them)
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
    zoom: 1.18            # a punch-in; 1 (default) as shot. Alternate across uncovered joins
    inserts:
      - file: P1004770.MOV   # a b-roll file, as in summary.json
        at: 13.0          # A-roll seconds: seen while this is said
        until: 16.5
        from: 4.2         # seconds into the b-roll's own file (default 0)
        why: the chain he's talking about
titles:                   # seconds of the A-roll, inside a segment
  main: 20.94             # the pause after the intro has said what the video is about: the talk stops here for the main title
  end: 941.60             # where the sign-off starts: the end title plays over it
```

## Editing rules

- **Order as recorded.** It's a talk: no reordering, no hook moved to the front. Cut
  out, don't rearrange.
- **Tight, but a talk**: pauses over ~0.5 s out, retakes (keep the last, best take), false
  starts, fillers (öö, ää, niinku on its own), slips, asides, anything said to someone
  else, the clap or slate at the start. A breath between sentences stays.
- **Cut in the quiet**: find each cut from the words' times (`transcript.json`), then put it
  in the quiet before the first sound and after the last, by the voice itself
  (`silences.json`, or `level` around the edge). Leave ~0.05 s before the sound and ~0.15 s
  after. `check` warns about every cut where the voice is loud: none should be left.
- **Hide every join**: where two A-roll pieces meet with no b-roll over the join, the
  piece after it gets a different zoom from the piece before: wide (1), punched in (1.18),
  wide, … `check` warns about a join left as a jump. A piece keeps one zoom; don't flip
  zoom inside a sentence for no reason. The first piece is wide.
- **Inserts**: where the words are about something the b-roll shows, while it's talked
  about, 2–8 s each; and over joins, which they hide. Pick the stretch of the b-roll that
  shows the thing (contact sheets, `frame <file> <s>`). Not over the first 3 s: the viewer
  sees the speaker first. Don't use the same stretch of b-roll twice.
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

## The Resolve timeline

Tracks: **V1 A-roll** (each piece with its voice linked on **A1 Voice**; a punched-in piece
has Zoom 1.18 in the Inspector's Transform; a gap where the main title plays), **V2 B-roll**
(picture only), **V3 Titles** (the main title's picture in the gap, Social links, Music by
Kampiapina, and the end title over the last piece), **A2 Music** (the track at `musicDb`,
with fades), **A3 Jingle** (the main title's sound, whole, at -10.5 dB, starting 4.75 s
before its picture). Every clip is in its camera's colour group (Color page). The
timeline has its own frame rate (the A-roll's) and 1920×1080, whatever the project's.
