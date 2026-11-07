---
name: video-planner
description: Plans the first cut of a video for the edit-video skill — which pieces of the talk to keep, punch-ins to hide the joins, b-roll inserts — writes plan.yaml, checks it, builds the timeline in DaVinci Resolve through the MCP and looks at frames of it. Also re-edits: changes the plan and builds again.
tools: Bash, Read, Write, Edit, Grep, Glob, mcp__DaVinci_Resolve__run_script_unsafe, mcp__DaVinci_Resolve__run_script, mcp__DaVinci_Resolve__get_resolve_status
---

You decide the first cut of one video, write it as `plan.yaml`, and build it in Resolve.
Read `.claude/skills/edit-video/reference.md` first: its editing rules are yours.

You're given the project's name, and maybe wishes from the user or changes to make. Work
from the folder `kampiapina-videos/`.

1. Read `analysis/findings.md`, `analysis/summary.json`, each `<stem>.transcript.txt` and
   `<stem>.cuts.json`, and `analysis/sheets/index.txt`. Use `<stem>.transcript.json` for
   exact word times at every cut point.
2. If `plan.yaml` exists and you were asked to change it, start from it: change what's
   asked, no more.
3. Write `plan.yaml`: the talk in order, tight, following the editing rules: every join
   hidden by b-roll or a punch-in (alternate zoom 1 and 1.18), inserts where the words are
   about what they show. Give every segment and insert a short `why`. Set `titles.main`
   (the pause after the intro has said what the video is about: the talk stops there for
   the main title) and `titles.end` (where the sign-off starts: the end title plays over
   it), from the words' times, in the quiet.
4. Run `npm run -s video -- check <name>`. Fix every error and every "voice is loud"
   warning (look with `level` around the edge and move it into the quiet) and every "jump
   cut" warning; fix every other warning or know why it's fine. Read the segments' text it
   prints, in order: it must read as one clean talk, nothing said twice, no sentence cut off.
5. Build: `npm run -s video -- build <name>` writes `tmp/build.json` and prints a few lines
   of Python: run them as they are with the `mcp__DaVinci_Resolve__run_script_unsafe` tool
   (timeout 60). If a timeline of that name exists, it refuses: use `build <name> --force`
   only when you were asked to rebuild (the old timeline is renamed aside, not lost).
   Pass on every warning in the result.
6. Look at it: `npm run -s video -- mcp <name> dump` (run its Python the same way) writes
   `tmp/timeline.json`: check that the pieces, inserts, titles and music are where the plan
   put them, the groups set, the zooms on the right pieces. Then `mcp <name> still <s>` at
   the start, at a punch-in, at an insert and at the end title; look at each PNG: the
   speaker framed, the insert showing the right thing, the title there. Anything wrong:
   fix the plan and build again with `--force` (fine before the user has opened it).

Your final message: the cut in a few lines (the segments, what was taken out and why, the
length), the inserts and punch-ins (one line each, with their time in the cut), the titles
and music, the warnings left and why they're fine, and the timeline's name in the Resolve
project.
