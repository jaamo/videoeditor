# Imports the footage and the music into the project, transcribes the clips asked for (the
# A-roll; the b-roll too with --all), and writes each transcript as words in ms of its file.
# The script goes on in Resolve after the MCP gives up waiting (60 s): it transcribes every
# clip left, one after another, and writes analysis/ingest.status.json after each. Run it
# again to see where it is: while a run is still going, a new one only collects what's done.
# ARGS: project, footage [{path, role}], music?, language, transcripts [{path, out}]
import json, os, time
pm = resolve.GetProjectManager()
project = load_project(pm, ARGS["project"])
mp = project.GetMediaPool()
root = mp.GetRootFolder()
footage = bin_named(mp, root, "Footage")
mp.SetCurrentFolder(footage)
have = clips_under(footage)
todo = [f["path"] for f in ARGS["footage"] if os.path.basename(f["path"]) not in have]
imported = [c.GetName() for c in (mp.ImportMedia(todo) or [])] if todo else []
have = clips_under(footage)
missing = [os.path.basename(f["path"]) for f in ARGS["footage"] if os.path.basename(f["path"]) not in have]
music = None
if ARGS.get("music"):
    mbin = bin_named(mp, root, "Music")
    mp.SetCurrentFolder(mbin)
    if os.path.basename(ARGS["music"]) not in clips_in(mbin):
        mp.ImportMedia([ARGS["music"]])
    music = os.path.basename(ARGS["music"]) in clips_in(mbin)
    mp.SetCurrentFolder(footage)
lang = ARGS.get("language", "fi")
if project.GetSetting("transcriptionLanguage") != lang:
    project.SetSetting("transcriptionLanguage", lang)

def words_of(clip, tr):
    fps = float(clip.GetClipProperty("FPS"))
    start = tc_frames(clip.GetClipProperty("Start TC"), fps) or 0
    ms = lambda tc: round((tc_frames(tc, fps) - start) / fps * 1000)
    out = []
    for seg in tr.get("segments", []):
        for w in seg.get("words", []):
            text = (w.get("text") or "").strip()
            if not text or text == "(...)":
                continue
            out.append({"text": text, "startMs": ms(w["start"]), "endMs": ms(w["end"])})
    return out

status = os.path.join(os.path.dirname(ARGS["transcripts"][0]["out"]), "ingest.status.json") if ARGS["transcripts"] else None
busy = False
if status and os.path.exists(status):
    try:
        with open(status, encoding="utf-8") as f:
            old = json.load(f)
        # A run still going (it wrote within the last 15 min): don't start a second transcription.
        busy = bool(old.get("busy")) and time.time() - os.path.getmtime(status) < 900
    except Exception:
        pass

def collect():
    """Writes every transcript Resolve has; returns what's written and what's still pending."""
    written, pending, redo = [], [], []
    for t in ARGS["transcripts"]:
        clip = have.get(os.path.basename(t["path"]))
        if not clip:
            continue
        if os.path.exists(t["out"]):
            written.append({"file": clip.GetName(), "out": t["out"]})
            continue
        tr = clip.GetTranscription()
        if tr and tr.get("language") and tr["language"] != lang:
            clip.ClearTranscription()
            redo.append(clip.GetName())
            tr = None
        if tr and tr.get("segments"):
            words = words_of(clip, tr)
            os.makedirs(os.path.dirname(t["out"]), exist_ok=True)
            with open(t["out"], "w", encoding="utf-8") as f:
                json.dump(words, f)
            written.append({"file": clip.GetName(), "words": len(words), "out": t["out"]})
        else:
            pending.append(clip)
    return written, pending, redo

def save(result):
    if status:
        os.makedirs(os.path.dirname(status), exist_ok=True)
        with open(status, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=1)

written, pending, redo = collect()
result = {"imported": imported, "missing": missing, "music": music, "language": lang, "written": len(written),
          "writtenFiles": [w["file"] for w in written], "pending": [c.GetName() for c in pending], "redone": redo, "busy": busy}
if pending and not busy:
    result["busy"] = True
    result["transcribing"] = pending[0].GetName()
    save(result)
    print(f"transcribing {len(pending)} clips in Resolve, {pending[0].GetName()} first: if this times out, Resolve goes on; run the ingest again to see how far it is (analysis/ingest.status.json)")
    for clip in pending:
        result["transcribing"] = clip.GetName()
        result["at"] = time.ctime()
        save(result)
        clip.TranscribeAudio()
        written, pending2, redo2 = collect()
        result.update({"written": len(written), "writtenFiles": [w["file"] for w in written], "pending": [c.GetName() for c in pending2], "redone": redo + redo2})
        save(result)
    result["busy"] = False
    result.pop("transcribing", None)
    save(result)
elif pending and busy:
    print(f"a run is still transcribing ({len(pending)} pending): collected what's done, see analysis/ingest.status.json")
else:
    result["busy"] = False
    save(result)
