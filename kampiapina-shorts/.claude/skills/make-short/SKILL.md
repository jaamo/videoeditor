---
name: make-short
description: Make a Kampiapina short (vertical, 1080×1920) from a 4K camera recording, with b-roll and screen recordings cut in - a first cut in Kdenlive by the agents, fixed by the user in Kdenlive, then finished by the agents with captions, emphasis zooms and the retro grade. Use when the user wants a short made, its first cut, its captions or a render, e.g. "/make-short trail-tips" or "finish the short".
---

# Make a short

The user gives a project name (`projects/<name>/`), and maybe wishes: what it's about, the
hook, a length. Read [reference.md](reference.md) once: it has the files, commands, the
three phases and the editing rules. You run the agents and talk to the user; the agents do
the work. Work from the folder `kampiapina-shorts/`. Pass each agent the project name and
the user's wishes that concern it.

Find where the project is first: no folder → 1; no `plan.yaml` → 2; no `<name>.kdenlive` →
3; a `.kdenlive` but no `out.mp4` → ask whether the Kdenlive edit is done (4) or to open
it; an `out.mp4` → ask what to do. If the user named a step, do that.

## 1. The project

No `projects/<name>/`: run `npm run -s short -- init <name>` and tell the user to drop all
the files in `projects/<name>/` as they are: the talking head, b-roll, screen recordings.
No sorting: the analyzer works out which is which. Wait for them to say it's done.

## 2. Analyze

Run the **short-analyzer** agent. It first sorts the dropped files into `footage/` by
looking at them, and tells you how. If it couldn't tell (two talking heads, say), it asks:
put the question to the user, then run it again with their answer. It returns the findings between
`=== analysis/findings.md ===` and `=== end ===`: save that text, exactly, to
`projects/<name>/analysis/findings.md`. Pass on its warnings when they matter (ElevenLabs
refused: the voice is only filtered locally; no OPENAI_API_KEY: nothing can be transcribed).

Tell the user in a line how the files were sorted, so a wrong guess is caught early.

## 3. First cut (phase 1)

Run the **short-planner**. It writes `plan.yaml`, checks it, makes `<name>.kdenlive`, and
looks at frames of it. Then tell the user, briefly: the hook, the segments (what's said,
length), the emphasis zooms and inserts, what was taken out, the length; and that it's
ready in Kdenlive. Offer to open it (`npm run -s short -- open <name>`), and say what to
fix there: timings and cuts, inserts, zooms (the camera clips' Transform keyframes), and
the captions' text and timing on the Subtitles track (a preview there; the render draws
them in the short's style). No grade in Kdenlive: that comes at the end. **Stop: the user edits now.** Ask
them to save in Kdenlive and say when it's done.

A change to the plan before the user has touched the project (they say "move the hook",
not "I edited it"): back to the planner, who rebuilds with `--force`. Once they've edited
in Kdenlive, never rebuild it from the plan unless they ask, knowing their edits go.

## 4. Finish (phase 3)

When the user says the Kdenlive edit is done, run the **short-finisher**: the render
(`out.mp4`), the captions as the user left them in Kdenlive. No review: the user has
already reviewed the cut in Kdenlive. Pass on the render's warnings that matter (a Transform
not covering its clip, captions made before the voice was cut differently): what's in the
cut is the user's, in Kdenlive; tell them what and where (seconds of the video).

## 5. Done

Tell the user: `projects/<name>/out.mp4`, its length, any warnings left open, and what was
paid for (ElevenLabs credits and OpenAI minutes the scripts printed).

## Doing part of it

"Just re-render", "fix the captions", "warmer look" (project.yaml's `grade`,
then render): run only what that takes. Every step reads its inputs from the project's
files. A review (**short-reviewer**, its text saved to `projects/<name>/review.md`) only
when the user asks for one. The captions are the user's in Kdenlive once they've edited: when the cut moves,
they move the captions there too. `captions --force` remakes them from the cut, losing
their fixes: only when the user asks.
