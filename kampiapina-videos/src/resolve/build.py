# The plan (tmp/build.json) as a timeline in Resolve: the A-roll pieces with their voice on
# tracks 1, b-roll over them on 2, the brand titles on 3 (the main title in a gap of the talk,
# its jingle on audio 3, the end title over the sign-off), music under it all, each clip in
# its camera's colour group, punch-ins as zooms.
# ARGS: build (path of build.json), force (replace a timeline of that name: the old one is renamed aside)
import json, os
with open(ARGS["build"], encoding="utf-8") as f:
    B = json.load(f)
pm = resolve.GetProjectManager()
project = load_project(pm, B["project"])
mp = project.GetMediaPool()
root = mp.GetRootFolder()
warnings = []

# The media: in the Footage bin (imported if it isn't there yet), the music in Music.
footage = bin_named(mp, root, "Footage")
mp.SetCurrentFolder(footage)
have = clips_in(footage)
todo = [m["path"] for m in B["media"] if m["key"] not in have]
if todo:
    mp.ImportMedia(todo)
    have = clips_in(footage)
items = {}
for m in B["media"]:
    if m["key"] not in have:
        raise RuntimeError(f'{m["key"]} is not in the Footage bin and could not be imported from {m["path"]}')
    items[m["key"]] = have[m["key"]]
music_item = None
if B.get("music"):
    mbin = bin_named(mp, root, "Music")
    mp.SetCurrentFolder(mbin)
    key = os.path.basename(B["music"]["path"])
    if key not in clips_in(mbin):
        mp.ImportMedia([B["music"]["path"]])
    music_item = clips_in(mbin).get(key)
    if not music_item:
        warnings.append(f"music {key} could not be imported: no music")
titles = {}
for t in B["titles"]:
    c = find_clip(root, t["name"])
    if not c:
        warnings.append(f'no title "{t["name"]}" in the media pool (the template has it in Brand/Titles): left out')
    titles[t["name"]] = c
groups = {g.GetName(): g for g in project.GetColorGroupsList()}

# The timeline: imported empty at the plan's frame rate (the API can't set a fractional rate).
name = B["timeline"]
old = timeline_named(project, name)
if old:
    if not ARGS.get("force"):
        raise RuntimeError(f'Timeline "{name}" exists in {project.GetName()}. It may hold edits made by hand: build with --force to put it aside (renamed "{name} (old N)") and make it again')
    n = 1
    while timeline_named(project, f"{name} (old {n})"):
        n += 1
    old.SetName(f"{name} (old {n})")
    warnings.append(f'the timeline before is now "{name} (old {n})"')
mp.SetCurrentFolder(root)
tl = mp.ImportTimelineFromFile(B["fcpxml"], {"timelineName": name, "importSourceClips": False})
if not tl:
    raise RuntimeError(f'Resolve did not make a timeline from {B["fcpxml"]}')
project.SetCurrentTimeline(tl)
tl.SetSetting("useCustomSettings", "1")
tl.SetSetting("timelineResolutionWidth", str(B["width"]))
tl.SetSetting("timelineResolutionHeight", str(B["height"]))
fps = float(tl.GetSetting("timelineFrameRate"))
if abs(fps - B["fps"]) > 0.01:
    warnings.append(f"the timeline is {fps} fps, the plan {B['fps']}")
for it in tl.GetItemListInTrack("video", 1) or []:
    tl.DeleteClips([it])
while tl.GetTrackCount("video") < 3:
    tl.AddTrack("video")
while tl.GetTrackCount("audio") < 3:
    tl.AddTrack("audio")
for i, n in ((1, "A-roll"), (2, "B-roll"), (3, "Titles")):
    tl.SetTrackName("video", i, n)
for i, n in ((1, "Voice"), (2, "Music"), (3, "Jingle")):
    tl.SetTrackName("audio", i, n)
start = tl.GetStartFrame()

# A-roll with its voice; then zooms and groups.
infos = [{"mediaPoolItem": items[a["key"]], "startFrame": a["inF"], "endFrame": a["outF"], "trackIndex": 1, "recordFrame": start + a["atF"]} for a in B["aroll"]]
placed = mp.AppendToTimeline(infos) or []
if len(placed) != len(infos):
    warnings.append(f"{len(placed)} of {len(infos)} A-roll pieces placed")
groupless = set()
def grade(item, key):
    g = next((m.get("group") for m in B["media"] if m["key"] == key), None)
    if not g:
        groupless.add(key)
        return
    if g not in groups:
        groups[g] = project.AddColorGroup(g)
        warnings.append(f'made the colour group "{g}": the project had none')
    item.AssignToColorGroup(groups[g])
for a, item in zip(B["aroll"], placed):
    grade(item, a["key"])
    if a.get("zoom", 1) != 1:
        item.SetProperties({"ZoomX": a["zoom"], "ZoomY": a["zoom"]})

# B-roll, picture only.
if B["broll"]:
    infos = [{"mediaPoolItem": items[b["key"]], "startFrame": b["inF"], "endFrame": b["outF"], "trackIndex": 2, "recordFrame": start + b["atF"], "mediaType": 1} for b in B["broll"]]
    placed_b = mp.AppendToTimeline(infos) or []
    if len(placed_b) != len(infos):
        warnings.append(f"{len(placed_b)} of {len(infos)} inserts placed")
    for b, item in zip(B["broll"], placed_b):
        grade(item, b["key"])

# The main title: its picture in the gap left for it on track 3, its jingle whole on audio 3, under the intro.
main_end = 0
if B.get("main"):
    m = B["main"]
    c = find_clip(root, m["name"])
    if not c:
        warnings.append(f'no main title "{m["name"]}" in the media pool (the template has it in Brand/Titles): left out, the gap for it is there')
    else:
        cfps = float(c.GetClipProperty("FPS") or fps)
        got = mp.AppendToTimeline([{"mediaPoolItem": c, "startFrame": round(m["from"] * cfps), "endFrame": round(m["to"] * cfps), "trackIndex": 3, "recordFrame": start + m["atF"], "mediaType": 1}]) or []
        if got:
            main_end = int(got[0].GetEnd()) - start
        else:
            warnings.append("the main title's picture was not placed")
        jingle = {"mediaPoolItem": c, "trackIndex": 3, "recordFrame": start + m["jingleAtF"], "mediaType": 2}
        if m["jingleFromS"] > 0:
            jingle.update({"startFrame": round(m["jingleFromS"] * cfps), "endFrame": int(c.GetClipProperty("Frames"))})
        got = mp.AppendToTimeline([jingle]) or []
        if got:
            got[0].SetProperties({"AudioVolume": m["jingleDb"]})
        else:
            warnings.append("the main title's jingle was not placed")

# The other titles on track 3, in order: Social links after the main title, Music by Kampiapina after it; the end title over the sign-off.
prev_end = main_end
end_at, end_frames = B["lengthF"], 0
for t in B["titles"]:
    c = titles.get(t["name"])
    if not c:
        continue
    at = t["atF"] if "atF" in t else prev_end + t["afterF"]
    got = mp.AppendToTimeline([{"mediaPoolItem": c, "trackIndex": t["track"], "recordFrame": start + at}]) or []
    if not got:
        warnings.append(f'"{t["name"]}" was not placed')
        continue
    prev_end = int(got[0].GetEnd()) - start
    if t.get("end"):
        end_at, end_frames = at, int(got[0].GetDuration())

# Music from before the main title to the end of the end title, faded.
if music_item and B.get("music"):
    m = B["music"]
    total = max(B["lengthF"], end_at + end_frames)
    need = total - m["atF"]
    have_frames = round(m["durationMs"] / 1000 * fps)
    if have_frames < need:
        warnings.append(f"the music is {round(m['durationMs'] / 1000)} s, the video {round(total / fps)} s: it ends early")
    # An audio clip's own frames count at its rate (the project's, for a music file), not the timeline's.
    mfps = float(music_item.GetClipProperty("FPS") or fps)
    got = mp.AppendToTimeline([{"mediaPoolItem": music_item, "startFrame": 0, "endFrame": round(min(need, have_frames) / fps * mfps), "trackIndex": 2, "recordFrame": start + m["atF"], "mediaType": 2}]) or []
    if got:
        got[0].SetProperties({"AudioVolume": m["db"]})
        got[0].SetFades({"FadeIn": m["fadeInF"], "FadeOut": m["fadeOutF"]})
    else:
        warnings.append("the music was not placed")

if groupless:
    warnings.append(f"no colour group for {', '.join(sorted(groupless))}: the camera is unknown")
d = timeline_dump(tl)
result = {"timeline": name, "fps": fps, "lengthS": d["lengthS"], "items": {k: len(v) for k, v in d["tracks"].items()}, "warnings": warnings}
