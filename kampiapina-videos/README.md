# kampiapina-videos

Full-length talking-head videos for Kampiapina, cut in DaVinci Resolve. Agents sort and
analyze the footage, cut the talk tight (pauses, retakes and fillers out), cut b-roll in,
hide the jump cuts with punch-ins, put every clip in its camera's colour group, and place
the brand titles and music. You finish the video in Resolve: the grade, the sound, the render.

```bash
npm install
```

Resolve must be running (Studio 21 or newer, with the Resolve MCP configured in Claude
Code) with the video's project, made from the Kampiapina template: it has the colour
groups (Lumix, DJI, GoPro) and the title compositions (Brand/Titles). Then in Claude Code,
from this folder:

```
/edit-video voitelu
```

## The two phases

1. **First cut (agents).** Point it at the folder the footage was dropped in: the talking
   head, the b-roll, the music, no sorting. The analyzer sorts them by looking at them (and
   asks if it can't tell), imports them into Resolve, has Resolve transcribe the talk, and
   looks at everything; the planner cuts the talk (`plan.yaml`) and builds the timeline.

   | Track | What |
   |---|---|
   | V3 Titles | the Main title after the intro (the talk stops for it), then Social links, then Music by Kampiapina; the End title over the sign-off |
   | V2 B-roll | inserts over the talk, picture only |
   | V1 A-roll | the talk's pieces, a punch-in (Zoom 1.18) on alternate pieces where nothing covers the join |
   | A1 Voice | the camera's sound, linked |
   | A2 Music | the track, -18 dB, faded, from just before the main title to the end |
   | A3 Jingle | the main title's sound, under the intro |

   Every clip is in its camera's colour group. The timeline runs at the footage's frame
   rate, 1920×1080, whatever the project's settings.
2. **You, in Resolve.** Everything after. No markers, no captions: nothing to go stale.

A re-edit before you've touched the timeline ("keep the second take") changes the plan and
builds it again; the old timeline is renamed aside.

## By hand

The agents' work is these commands (`npm run video -- <command> <name>`); the file formats
and editing rules are in `.claude/skills/edit-video/reference.md`.

| Command | Does |
|---|---|
| `init <name> <folder> [--project <Resolve project>]` | the project: where the footage is, the music found there |
| `sort` | each file's size, length, sound, camera and a contact sheet; then their roles |
| `analyze` | the voice, silences, the transcript as text, a first guess at the cut, contact sheets |
| `frame <file> <s>` | a frame of a footage file |
| `level <from> <to>` | the voice's loudness, to cut in the quiet |
| `check` | the plan's problems |
| `build [--force]` | `tmp/build.json`, and the Resolve script to run |
| `mcp <ingest\|build\|dump\|still>` | the Python for the Resolve MCP: import and transcribe, build the timeline, read it back, a frame of it |

Transcription is Resolve's own (local, free). Needs ffmpeg (`brew install ffmpeg`).
