# DaVinci Resolve, as the scripts use it

Facts about Resolve's scripting API and the MCP that the scripts in `src/resolve/` rely on,
learned the hard way (Resolve Studio 21.1, macOS, the Resolve MCP). Read this before
changing those scripts or writing a new one.

## The MCP

- `mcp__DaVinci_Resolve__run_script_unsafe` runs Python inside Resolve with `resolve`
  given; `result` is returned, `print` output too. Its timeout is 60 s at most, but **the
  script goes on inside Resolve after the MCP gives up**: a long job (transcribing 97
  clips, building 300 pieces) is started with one call and followed through a status file
  it writes (`analysis/ingest.status.json`, `tmp/build.result.json`). `run_script` (the
  safe one) can't `import os` or open files.
- The MCP's Python has an ASCII default encoding: `open(path, encoding="utf-8")` for any
  path with ä or ö, and for every file written.
- The bootstrap (`npm run video -- mcp <name> <script>`) is `ARGS = json.loads(…)` plus
  `exec(compile(open(<common.py>).read(), …))` and the script: the scripts share
  `common.py` (project loading, bins, timecode, the dump).

## Projects, bins, clips

- The user's projects come from the "Kampiapina Template": colour groups Lumix / DJI /
  GoPro / No grading, a Brand/Titles bin with the Fusion compositions "End title",
  "Social links", "Music by Kampiapina" and the timeline "Main title 2026 (merged)",
  project fps 29.97. The user may have sorted the footage into sub-bins (Footage/A-roll,
  Footage/B-roll): `clips_under()` finds clips anywhere under a bin.
- `MediaPool.ImportMedia` wants plain path strings (dicts with FilePath return nothing).
- `MediaPoolItem.TranscribeAudio` blocks until done; set the project setting
  `transcriptionLanguage` ("fi") first or it auto-detects wrongly. `GetTranscription`'s
  word times are absolute clip timecode: subtract the clip's "Start TC". Resolve's
  Finnish is rough and it loops on noise ("Jatkuu" ×11): treat repeated-word runs as
  artefacts. About 7 min of audio transcribes per 2 min of wall clock on an M-series Mac.
- Rotation tags: Resolve applies a file's 180° display-rotation tag itself (a chest cam
  worn upside down shows upright; ffmpeg's contact sheets agree) but shows a ±90° tag as
  stored. `TimelineItem.SetProperty("RotationAngle", -tag)` stands it up (ffprobe −90 →
  RotationAngle 90). Inside a 180°-tagged file a stretch shot the other way up (the
  camera taken in the hand) needs RotationAngle 180 on that piece.

## Timelines

- `Timeline.SetSetting("timelineFrameRate")` takes only integer rates: a 23.976 or 29.97
  timeline is made by importing an empty FCPXML (`emptyFcpxml()`, a gap-only spine with
  `frameDuration 1001/30000s`) with `MediaPool.ImportTimelineFromFile`; the resolution is
  then set with `SetSetting`.
- `AppendToTimeline`: `startFrame`/`endFrame` are the clip's own frames at its own fps
  (`endFrame` exclusive), `recordFrame` is absolute (`GetStartFrame()` + offset),
  `mediaType` 1 = picture only, 2 = sound only. A clip at another rate than the timeline
  (25 fps on 29.97) lands a frame longer or shorter than planned: the build places the
  A-roll one piece at a time and moves what follows by the difference. An mp3 reports the
  project's fps and its frames count at that rate: convert, or the music is cut short.
  A timeline in the media pool (the main title) appends like a clip, picture and sound
  separately, frames at its own fps.
- A clip turned ±90° (`RotationAngle`) shows as a pillar: `SetProperties({"ZoomX": 1.778, "ZoomY": 1.778})`
  on the same item fills the frame with the middle of the tall picture (zoom and rotation both
  centre on the frame).
- Punch-ins are `SetProperties({"ZoomX", "ZoomY"})`; fades `SetFades({"FadeIn", "FadeOut"})`
  in frames; the volume `AudioVolume` in dB. Colour groups:
  `item.AssignToColorGroup(project.GetColorGroupsList()[i])`.
- `Project.ExportCurrentFrameAsStill(path)` works after `Timeline.SetCurrentTimecode`;
  a drop-frame (29.97) timeline needs `;` timecodes (`timecode_at()` in common.py).
- The dump (`timeline_dump()`) gives every item's place, source frames, group, zoom and
  volume: compare a dump taken after the build with one taken later to read the user's
  hand edits (what they cut, trimmed, zoomed, moved).
