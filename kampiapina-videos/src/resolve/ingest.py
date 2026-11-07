# Imports the footage and the music into the project, transcribes the A-roll, and writes each
# transcript as words in ms of its file. Run again until every transcript is written: Resolve
# transcribes in the background, and a long clip outlasts the MCP's timeout.
# ARGS: project, footage [{path, role}], music?, language, transcripts [{path, out}]
import json, os
pm = resolve.GetProjectManager()
project = load_project(pm, ARGS["project"])
mp = project.GetMediaPool()
root = mp.GetRootFolder()
footage = bin_named(mp, root, "Footage")
mp.SetCurrentFolder(footage)
have = clips_in(footage)
todo = [f["path"] for f in ARGS["footage"] if os.path.basename(f["path"]) not in have]
imported = [c.GetName() for c in (mp.ImportMedia(todo) or [])] if todo else []
have = clips_in(footage)
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

written, pending, redo = [], [], []
for t in ARGS["transcripts"]:
    clip = have.get(os.path.basename(t["path"]))
    if not clip:
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
result = {"imported": imported, "missing": missing, "music": music, "language": lang, "written": written,
          "pending": [c.GetName() for c in pending], "redone": redo}
status = os.path.join(os.path.dirname(ARGS["transcripts"][0]["out"]), "ingest.status.json") if ARGS["transcripts"] else None
if status:
    os.makedirs(os.path.dirname(status), exist_ok=True)
    with open(status, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=1)
if pending:
    # Blocks until done (or until the MCP gives up: Resolve goes on in the background). Run again to collect it.
    print(f"transcribing {pending[0].GetName()} in Resolve: if this times out, run the ingest again in a minute")
    pending[0].TranscribeAudio()
    result["transcribed"] = pending[0].GetName()
