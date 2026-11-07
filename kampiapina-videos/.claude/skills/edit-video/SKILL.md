---
name: edit-video
description: Make the first cut of a Kampiapina full-length talking-head video in DaVinci Resolve - the footage sorted and analyzed, the talk cut tight (pauses, retakes, fillers out), b-roll cut in, jump cuts hidden with punch-ins, clips in their camera's colour group, brand titles and music placed - for the user to finish in Resolve. Use when the user wants a video's first cut, a re-edit of it, or its analysis, e.g. "/edit-video voitelu" or "cut the voitelu video".
---

# Edit a video

The user gives a project name (`projects/<name>/`), maybe the folder the footage is in, and
maybe wishes: what it's about, what to keep, what to show. Read [reference.md](reference.md)
once: it has the files, commands, the phases and the editing rules. You run the agents and
talk to the user; the agents do the work. Work from the folder `kampiapina-videos/`. Pass
each agent the project name and the user's wishes that concern it. Resolve must be
running with the video's project (made from the Kampiapina template) open, or at least in
the project list.

Find where the project is first: no `project.yaml` → 1; no `analysis/findings.md` → 2; no
`plan.yaml` → 3; a plan → ask whether to re-edit, or what to do. If the user named a step, do that.

## 1. The project

No `projects/<name>/`: ask for the folder the footage is in (the videos, or a `footage/`
folder in it, and the music), and the Resolve project's name if it isn't `<name>`. Run
`npm run -s video -- init <name> <folder> [--project <Resolve project>]`.

## 2. Analyze

Run the **video-analyzer** agent. It sorts the files (and asks, through you, if it can't tell
which is the A-roll), ingests them into Resolve, has Resolve transcribe the talk, analyzes it
all and returns the findings between `=== analysis/findings.md ===` and `=== end ===`: save
that text, exactly, to `projects/<name>/analysis/findings.md`. Tell the user in a line how
the files were sorted and which camera each is from, so a wrong guess is caught early.

## 3. First cut

Run the **video-planner**. It writes `plan.yaml`, checks it, builds the timeline in Resolve
and looks at frames of it. Then tell the user, briefly: the segments (what's said, length),
what was taken out and why, the inserts and punch-ins, the titles and music, the length;
and that the timeline `<name>` is in the Resolve project. **Stop: the user finishes it in
Resolve.**

## Re-edits

A change before the user has touched the timeline ("keep the second take", "move that
insert"): back to the planner, which changes the plan and builds again with `--force` (the
old timeline is renamed aside). Once they've edited in Resolve, never rebuild unless they
ask, knowing their edits stay only in the renamed timeline.

## Doing part of it

"Just analyze", "check the plan", "a frame at 1:20": run only what that takes. Every step
reads its inputs from the project's files.
