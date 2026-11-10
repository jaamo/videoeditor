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
on its warnings to the user when they matter (low sync confidence).

## 3. Titles and plan

Run **video-titles** and **video-planner** at the same time (one message, two agents).

## 4. The draft in Kdenlive

Rendering is slow; the user checks the cut in Kdenlive instead. Run, yourself:

1. `npm run -s video -- kdenlive <name>`: the plan as `projects/<name>/<name>.kdenlive`: the
   screen recording whole (no zooms), the face small in its corner all the way through, the
   clean voice, and the captions on Kdenlive's Subtitles track. Guides mark each segment
   (number, layout, why) and each zoom. The first time it makes proxies of the footage
   (a minute or two); give it a long timeout.
2. `npm run -s video -- open <name>`: opens it in Kdenlive.

Then show the user, briefly: the end line; the plan as a list of segments (layout, length,
what's said, zooms); what was taken out; the length of the video. Tell them what they can fix
in Kdenlive and save:

- **the cut**: trim, split, move or delete pieces; the Sound track is what the render
  follows (the screen and face are grouped with it). Pieces may be lengthened into what was
  cut out.
- **the captions**: their text and timing on the Subtitles track.
- Layouts (face / screen) and zooms aren't in the draft: they come from `plan.yaml`, by the
  recording's time. Ask for those in words.

**Wait** until they say they're done. Changes asked in words go to the planner (or the titles
agent); a new plan needs the draft made again, `kdenlive <name> --force`, which **loses the
fixes made in Kdenlive** (a copy is kept in `tmp/`): say so and ask before doing it, unless
it's layouts or zooms only, which need no new draft. `captions <name> --force` makes the
captions again from the cut as it is now (losing the caption fixes): for when the cut was
changed a lot after they were made.

## 5. Render

1. **video-editor**: render `out.mp4`. It reads the cut and captions from the draft; pass on
   its warnings (picture moved out of step with the sound, gaps, captions over nothing).
2. No review round by default: the user has already watched the cut. Run the
   **video-reviewer** if they ask (save its review between `=== review.md ===` and `=== end ===`
   to `projects/<name>/review.md`); its fixes about the cut or captions are for the user to
   make in Kdenlive (tell them where), those about layouts, zooms and titles go to the planner
   or the titles agent.

A project without a draft (made before it, or when the user asks to skip it) renders from the
plan as before: render, review, and give `review.md` to the planner on `Verdict: FIX`, at most
three rounds.

## 6. Done

Tell the user: `projects/<name>/out.mp4`, its length, the review's verdict if there was one
and anything left open, and what was paid for (the OpenAI minutes the analysis printed).
Offer the comments page (7) for their own notes.

## 7. The user's comments

When the user wants to watch it and say what to change:

1. Start the page in the background (Bash with `run_in_background`):
   `npm run -s video -- comments <name>` (add `--sample` for sample.mp4), and give the user
   the link it prints (http://localhost:4321). They watch, pause, press C and write; each
   comment is saved to `projects/<name>/comments.yaml` at once, with where it is in the video,
   which segment, and the seconds of the recording.
2. Wait until they say they're done. Then read `comments.yaml`, and send its open comments
   (those without `done: true`) to the agents they concern: the opening title and end card to
   **video-titles**, everything else to **video-planner** (to revise, from the comments).
   With a draft, comments on the cut or the captions are quicker fixed in Kdenlive: say
   which, and where (the draft's time is the video's).
3. Render (and review, if wanted) as in 5; then show the user, comment by comment, what
   was done. The planner marks the ones it handled `done: true`, so the page shows them
   struck through; the page can stay open (reload it for the new video).
4. Stop the page (the background task) when the user is finished with it.

## Doing part of it

The user may ask for one step: "just re-render", "review it", "new title", "cut the bit
about X". Run only the agents that takes, in the order above; every step reads its inputs
from the project's files.
