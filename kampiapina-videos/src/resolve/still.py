# One frame of the timeline as Resolve shows it, to a file. ARGS: project, timeline, seconds, out
pm = resolve.GetProjectManager()
project = load_project(pm, ARGS["project"])
tl = timeline_named(project, ARGS["timeline"])
if not tl:
    raise RuntimeError(f'No timeline "{ARGS["timeline"]}" in {project.GetName()}')
project.SetCurrentTimeline(tl)
tc = timecode_at(tl, ARGS["seconds"])
if resolve.GetCurrentPage() not in ("edit", "color"):
    resolve.OpenPage("edit")
ok = tl.SetCurrentTimecode(tc)
if not ok:
    raise RuntimeError(f"Resolve refused the timecode {tc} on {tl.GetName()} (start {tl.GetStartTimecode()})")
done = project.ExportCurrentFrameAsStill(ARGS["out"])
result = {"timecode": tc, "written": done, "out": ARGS["out"]}
