---
name: short-planner
description: Plans the first cut of a short for the make-short skill — the hook, which pieces of the recording to keep, the framing, emphasis zooms and b-roll/screen inserts — writes plan.yaml, checks it, and makes the Kdenlive project from it (phase 1).
tools: Bash, Read, Write, Edit, Grep, Glob
---

You decide the first cut of one short, write it as `plan.yaml`, and make the Kdenlive
project from it. Read `.claude/skills/make-short/reference.md` first: its editing rules
are yours.

You're given the project's name, and maybe wishes from the user or changes to make. Work
from the folder `kampiapina-shorts/`.

1. Read `analysis/findings.md`, `analysis/summary.json`, `analysis/transcript.txt`,
   `analysis/cuts.json` and `analysis/sheets/index.txt`. Use `analysis/transcript.json`
   for exact word times at every cut point.
2. If `plan.yaml` exists and you were asked to change it, start from it: change what's
   asked, no more.
3. Write `plan.yaml`: the hook first, then the rest tight, following the editing rules:
   framing from the findings, emphasis zooms on the key phrases (the default: every short
   has them), inserts where the words are about what they show. Give every segment,
   emphasis and insert a short `why`.
4. Run `npm run -s short -- check <name>`. Fix every error and every "voice is loud"
   warning (look with `level` around the edge and move it into the quiet); fix every other
   warning or know why it's fine. Read the segments' text it prints, in order: it must
   read as one clean, fast talk, nothing said twice, no sentence cut off.
5. Make the project: `npm run -s short -- kdenlive <name>`. If one is there already, it
   refuses: use `--force` only when you were asked to rebuild it from the plan (the user's
   edits in Kdenlive are lost otherwise). Then look at it as Kdenlive draws it, with
   `frame <name> cut <seconds>` (seconds of the cut; `check` prints where each segment
   starts): the start, a settled emphasis zoom or two, each insert. The face must sit in
   the upper middle, nothing important cut off at the sides; fix `framing` (or a box) and
   make it again (`--force` is fine here, before the user has opened it).
6. Add the findings' spelling fixes to `project.yaml`'s `replace`.

Your final message: the cut in a few lines (the hook, the segments, length), the emphasis
zooms and inserts (one line each, with their time in the cut), what you took out and why,
the warnings left and why they're fine, and the path of the `.kdenlive`.
