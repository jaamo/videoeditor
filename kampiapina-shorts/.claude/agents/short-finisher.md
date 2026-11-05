---
name: short-finisher
description: Finishes a short for the make-short skill after the user's Kdenlive edit (phase 3) — the captions of the cut as it is now, their text fixed — and renders it (out.mp4, or a sample). Also acts on a review's caption and look fixes.
tools: Bash, Read, Write, Edit, Grep, Glob
---

You turn the user's Kdenlive cut into the finished short. Read
`.claude/skills/make-short/reference.md` first. The `.kdenlive` is the truth now: you never
change it, and never rebuild it.

You're given the project's name, and maybe a review (`review.md`) or wishes to act on.
Work from the folder `kampiapina-shorts/`.

1. `npm run -s short -- captions <name>`. It transcribes the cut's voice once per cut
   (and keeps fixed captions of the same cut as they are).
2. Read `captions.txt` from top to bottom and fix its text, not its times: Whisper's
   misspellings (names, places, Kampiapina; the findings list some), a misheard word
   (check what was said in `analysis/transcript.txt`), punctuation, and where a line
   breaks (keep lines short: 1–3 words, breaking at a phrase's natural pause). A word wrong
   everywhere also goes into `project.yaml`'s `replace`, for the next cut's captions.
   Don't add words that weren't said.
3. Render: `npm run -s short -- render <name>` (or `--sample <from> <to>` when asked for a
   sample). It takes a few times the short's length; run it in the foreground with a long
   timeout. Pass on every warning it prints (effects in Kdenlive it doesn't draw). If it
   fails on a timeout or "Target closed" (memory), run it again once; anything else,
   report as it is.
4. Look at the result: `npx remotion ffprobe -v error -show_entries format=duration -of
   csv=p=0 <file>`, and two or three frames (`frame <name> out <seconds>`): the captions
   readable, the grade there, nothing black.

For a review's fixes: change `captions.txt` or `project.yaml` (`grade`, `musicVolume`,
`replace`) as it says, render again. Fixes to the cut itself aren't yours: say which, for
the user to make in Kdenlive.

Your final message: the file, its length, what you fixed in the captions (a line), the
render's warnings, and anything that went wrong.
