---
name: make-video
description: Edit a product video of Outerview from a face camera recording and/or a screen recording - analyze, title, plan, render and review it with the video agents. Use when the user wants a video made, re-edited, re-rendered or checked from a project in projects/, e.g. "/make-video my-demo".
---

# Make a video

The user gives a project name (`projects/<name>/`), and maybe wishes: a title, what to
leave out, a length. Read [reference.md](reference.md) once: it has the files, commands and
editing rules the agents follow. You run the agents in order and talk to the user; the
agents do the work. Pass each one the project name and the user's wishes that concern it.

## 1. The project

- No `projects/<name>/`: run `npm run -s video -- init <name>` and tell the user to put the
  recordings in `projects/<name>/footage/`: a vertical face video and/or a screen recording
  (landscape). Wait for them to say it's done.
- Check `footage/` has one or two videos. Ask nothing else up front.

## 2. Analyze

Run the **video-analyzer** agent. It skips work done before. It returns the findings between
`=== analysis/findings.md ===` and `=== end ===`: save that text, exactly, to
`projects/<name>/analysis/findings.md` (agents return files like this; you write them). Pass
on its warnings to the user when they matter (ElevenLabs refused: the voice is only filtered
locally; low sync confidence).

## 3. Titles and plan

Run **video-titles** and **video-planner** at the same time (one message, two agents).

Then show the user, briefly: the title (and subtitle, end line); the plan as a list of
segments (layout, length, what's said, zooms); what was taken out; the length of the video.
Ask whether to render, or what to change. **Wait for the answer** unless the user said not to
stop. Changes go back to the planner (or the titles agent), then show again.

To check something before the whole render, a sample is quick: the **video-editor** with
`--sample <from> <to>` (seconds of the video).

## 4. Render and review

1. **video-editor**: render `out.mp4`.
2. **video-reviewer**: review it. Save the review it returns (between `=== review.md ===` and
   `=== end ===`) to `projects/<name>/review.md`.
3. `Verdict: FIX`: give `review.md` to the **video-planner** to revise (and the titles agent,
   if it's about the titles), then render and review again. At most three rounds; then
   stop and show the user what's left.

## 5. Done

Tell the user: `projects/<name>/out.mp4`, its length, the review's verdict and anything left
open, and what was paid for (ElevenLabs credits and OpenAI minutes the analysis printed).
Offer the comments page (6) for their own notes.

## 6. The user's comments

When the user wants to watch it and say what to change:

1. Start the page in the background (Bash with `run_in_background`):
   `npm run -s video -- comments <name>` (add `--sample` for sample.mp4), and give the user
   the link it prints (http://localhost:4321). They watch, pause, press C and write; each
   comment is saved to `projects/<name>/comments.yaml` at once, with where it is in the video,
   which segment, and the seconds of the recording.
2. Wait until they say they're done. Then read `comments.yaml`, and send its open comments
   (those without `done: true`) to the agents they concern: the opening title and end card to
   **video-titles**, everything else to **video-planner** (to revise, from the comments).
3. Render, review and save the review as in 4; then show the user, comment by comment, what
   was done. The planner marks the ones it handled `done: true`, so the page shows them
   struck through; the page can stay open (reload it for the new video).
4. Stop the page (the background task) when the user is finished with it.

## Doing part of it

The user may ask for one step: "just re-render", "review it", "new title", "cut the bit
about X". Run only the agents that takes, in the order above; every step reads its inputs
from the project's files.
