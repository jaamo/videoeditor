# The timeline as it is now, as JSON: every item of every track. ARGS: project, timeline, out
import json
pm = resolve.GetProjectManager()
project = load_project(pm, ARGS["project"])
tl = timeline_named(project, ARGS["timeline"])
if not tl:
    raise RuntimeError(f'No timeline "{ARGS["timeline"]}" in {project.GetName()}')
d = timeline_dump(tl)
with open(ARGS["out"], "w", encoding="utf-8") as f:
    json.dump(d, f, indent=1)
counts = {k: len(v) for k, v in d["tracks"].items()}
result = {"out": ARGS["out"], "fps": d["fps"], "lengthS": d["lengthS"], "items": counts}
