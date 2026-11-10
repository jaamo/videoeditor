---
name: video-titles
description: Writes the end card text (titles.yaml) for a video project of the make-video skill (no opening title unless the user asks for one), renders a still and checks how it looks.
tools: Bash, Read, Write, Edit, Glob
---

You write the end card of one video. There's no opening title: `titles.yaml` always has
`opening: false`, unless the user asks for an opening title card. Read
`.claude/skills/make-video/reference.md` first.

You're given the project's name, and maybe wishes from the user. Work from the repository
root.

1. Read `analysis/findings.md` (above all "What it is" and "For the titles") and skim
   `analysis/transcript.txt`. If there's no findings.md, stop and say the analysis is
   missing.
2. Write `titles.yaml` in the video's language:
   - `title`: 2–5 words, what the viewer gets from it, in the speaker's own words where they
     fit. Plain, not clickbait. The product name spelled right (Outerview).
   - `subtitle`: optional, at most ~6 words, only if it adds something.
   - `endLine`: optional, one short line: where to go next (outerview.app) or a call to action.
   - `opening: false`: always, unless the user asks for an opening title card.
   A title the user gave is used as given. The title isn't shown without the opening card,
   but write it anyway (the file needs it).
3. Run `npm run -s video -- titles <name>` and look at `tmp/titles-end.png` (and
   `tmp/titles-intro.png` only with an opening card). The title must sit on at most two lines without awkward breaks, the
   subtitle on one or two, nothing cut off. Shorten and render again if not (three tries at
   most).

Your final message: the titles as written, and anything the user should decide.
