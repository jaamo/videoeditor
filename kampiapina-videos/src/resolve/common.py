# Shared by the scripts run through the Resolve MCP: `resolve` is given, ARGS is the script's input.
import json, os, re

def load_project(pm, name):
    """The named project, opened if it isn't the current one."""
    cur = pm.GetCurrentProject()
    if cur and cur.GetName() == name:
        return cur
    if not pm.LoadProject(name):
        raise RuntimeError(f'No Resolve project "{name}" in the current folder: {pm.GetProjectListInCurrentFolder()}')
    return pm.GetCurrentProject()

def bin_named(mp, parent, name):
    for f in parent.GetSubFolderList() or []:
        if f.GetName() == name:
            return f
    return mp.AddSubFolder(parent, name)

def clips_in(folder):
    return {c.GetName(): c for c in (folder.GetClipList() or [])}

def find_clip(folder, name):
    """A media pool item by name, anywhere under `folder`."""
    for c in folder.GetClipList() or []:
        if c.GetName() == name:
            return c
    for s in folder.GetSubFolderList() or []:
        r = find_clip(s, name)
        if r:
            return r
    return None

def timeline_named(project, name):
    for i in range(project.GetTimelineCount()):
        t = project.GetTimelineByIndex(i + 1)
        if t and t.GetName() == name:
            return t
    return None

def tc_frames(tc, fps):
    """Frames of a timecode at the rate's nominal count (24 for 23.976)."""
    m = re.match(r"^(\d+)[:;](\d+)[:;](\d+)[:;](\d+)$", tc or "")
    if not m:
        return None
    h, mi, s, f = (int(x) for x in m.groups())
    nominal = round(fps)
    return ((h * 60 + mi) * 60 + s) * nominal + f

def item_dump(it):
    mpi = it.GetMediaPoolItem()
    g = it.GetColorGroup()
    props = it.GetProperties() or {}
    return {
        "name": it.GetName(), "type": it.GetType(), "start": it.GetStart(), "end": it.GetEnd(), "duration": it.GetDuration(),
        "srcStart": it.GetSourceStartFrame(), "srcEnd": it.GetSourceEndFrame(), "media": mpi.GetName() if mpi else None,
        "group": g.GetName() if g else None, "zoom": props.get("ZoomX"), "volumeDb": props.get("AudioVolume"), "enabled": it.GetClipEnabled(),
    }

def timeline_dump(tl):
    fps = float(tl.GetSetting("timelineFrameRate"))
    start = tl.GetStartFrame()
    out = {"name": tl.GetName(), "fps": fps, "start": start, "end": tl.GetEndFrame(), "lengthS": round((tl.GetEndFrame() - start) / fps, 2),
           "res": [tl.GetSetting("timelineResolutionWidth"), tl.GetSetting("timelineResolutionHeight")], "tracks": {}}
    for kind in ("video", "audio"):
        for i in range(1, tl.GetTrackCount(kind) + 1):
            items = []
            for it in tl.GetItemListInTrack(kind, i) or []:
                d = item_dump(it)
                d["atS"] = round((d["start"] - start) / fps, 2)
                d["endS"] = round((d["end"] - start) / fps, 2)
                items.append(d)
            out["tracks"][f"{kind} {i} {tl.GetTrackName(kind, i)}"] = items
    return out

def tc_split(tc):
    m = re.match(r"^(\d+)[:;](\d+)[:;](\d+)[:;](\d+)$", tc or "")
    return [int(x) for x in m.groups()] if m else None

def tc_to_frame(tc, nominal, drop):
    """A timecode as a frame count: drop-frame skips 2 frames (4 at 60) a minute, except every tenth."""
    h, m, s, f = tc_split(tc)
    total = ((h * 60 + m) * 60 + s) * nominal + f
    if drop:
        per = 2 * (nominal // 30)
        minutes = h * 60 + m
        total -= per * (minutes - minutes // 10)
    return total

def frame_to_tc(frame, nominal, drop):
    if drop:
        per = 2 * (nominal // 30)
        per_min = nominal * 60 - per
        per_10 = per_min * 10 + per
        d, m = divmod(frame, per_10)
        frame += per * 9 * d + (per * ((m - per) // per_min) if m > per else 0)
    f = frame % nominal; frame //= nominal
    s = frame % 60; frame //= 60
    m = frame % 60; h = frame // 60
    sep = ";" if drop else ":"
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{f:02d}"

def timecode_at(tl, seconds):
    """The timecode of a moment of the timeline, from its start, at its own count (drop-frame when it is)."""
    fps = float(tl.GetSetting("timelineFrameRate"))
    nominal = round(fps)
    start = tl.GetStartTimecode()
    drop = ";" in (start or "") or tl.GetSetting("timelineDropFrameTimecode") == "1"
    return frame_to_tc(tc_to_frame(start, nominal, drop) + round(seconds * fps), nominal, drop)
