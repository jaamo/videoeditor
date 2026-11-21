# A b-roll pass on the timeline as it is: appends tmp/broll.json's items on video track 2 (picture
# only, turned as planned, in their camera's colour group). Nothing else is touched. The result goes
# to tmp/broll.result.json too (a long list outlasts the MCP's timeout). ARGS: project, timeline, items (path)
import json, os
pm = resolve.GetProjectManager()
project = load_project(pm, ARGS["project"])
mp = project.GetMediaPool()
root = mp.GetRootFolder()
tl = timeline_named(project, ARGS["timeline"])
if not tl:
    raise RuntimeError(f'No timeline "{ARGS["timeline"]}" in {project.GetName()}')
with open(ARGS["items"], encoding="utf-8") as f:
    B = json.load(f)
fps = float(tl.GetSetting("timelineFrameRate")); start = tl.GetStartFrame()
while tl.GetTrackCount("video") < 2:
    tl.AddTrack("video")
have = clips_under(bin_named(mp, root, "Footage"))
groups = {g.GetName(): g for g in project.GetColorGroupsList()}
status = os.path.join(os.path.dirname(ARGS["items"]), "broll.result.json")
placed, failed = [], []
def save(busy):
    with open(status, "w", encoding="utf-8") as f:
        json.dump({"busy": busy, "placed": placed, "failed": failed}, f, indent=1)
for i, x in enumerate(B["items"]):
    clip = have.get(x["key"])
    if not clip:
        failed.append({"key": x["key"], "atS": x["atS"], "why": "not in the Footage bin"}); continue
    got = mp.AppendToTimeline([{"mediaPoolItem": clip, "startFrame": x["inF"], "endFrame": x["outF"], "trackIndex": 2, "recordFrame": start + x["atF"], "mediaType": 1}]) or []
    if not got:
        failed.append({"key": x["key"], "atS": x["atS"], "why": "not placed (something there?)"}); continue
    it = got[0]
    if x.get("rotation"):
        it.SetProperty("RotationAngle", x["rotation"])
    g = x.get("group")
    if g and g in groups:
        it.AssignToColorGroup(groups[g])
    placed.append({"key": x["key"], "atS": x["atS"], "endS": round((it.GetEnd() - start) / fps, 2), "rotation": x.get("rotation", 0)})
    if i % 10 == 0:
        save(True)
save(False)
result = {"placed": len(placed), "failed": failed, "v2": len(tl.GetItemListInTrack("video", 2) or [])}
