# musat: findings

## What it is
Kampiapina (cycling videos) composes his own music for his videos and fits it to the picture: intense on fast riding, calm on calm parts, with transitions, plus musical jokes (drone crash). Claim: stock music and AI can't do that. Talking head in Finnish (spoken style), with three DaVinci Resolve screen recordings that play the examples. For viewers of his channel and video makers.

## Timeline (camera seconds)
- 0.00–12.97: "Haloo?" (0.96–1.44), then silence. He sets up, looking at the camera.
- 12.94–15.84: "Mä teen mun videoihin musat ite."
- 16.34–22.52: he can compose the music to fit the picture perfectly.
- 23.10–28.20: "Esimerkiksi jos ajetaan kovaa, niin sitten musa voi olla intensiivisempää, niin kuin tässä."
- 28.28–32.33: silence (the example playing in his earbuds).
- 32.24–41.72: calm part, the music calms too; "nää kaikki siirtymät"; when riding starts again the music turns more intense, "niin kuin tässä".
- 41.82–46.68: silence (example).
- 46.24–53.00: take 1: "Tai sit mä voin lähteä leikittelemään, niin kuin vaikka tässä dronen onnettomuuskohtauksessa."
- 53.06–57.08: silence.
- 57.14–63.00: take 2: "...leikittelemään sillä musalla, niin kuin vaikka tässä, missä mulla drone lentää puuhun."
- 63.09–69.98: silence (example).
- 69.46–77.78: "Ja tää on niinku sellas, mitä ei silleen valmis stokki musiikille pysty tekee, ei oikein tekoälylläkään pysty tekee."
- 78.56–84.90: "tosi siisti ite tehdä ja nyplätä. Se on niinku hauskaa."
- 85.08–87.58: "toi lopputulos on jotenkin, en mä tiedä." (trails off)
- 88.26–89.58: "Mä niinku sytyn ite siitä." Smiles and laughs around 90 s.
- 90.44–93.08: "siitä lopputuloksesta tulee vaan niinku siisti."
- 93.78–97.28: "...mä en oikein törmännyt siihen, että kukaan muu tekisi niinku tällaista." Hand on chin, looks down around 95 s.
- 97.19–102.53: silence; looks down, thinking.
- 102.10–120.08: second pass at the ending (see Problems).
- 120.13–124.39: silence, end.

He stays seated and in frame the whole time. His right hand gestures at the frame's right edge, and he leans in a little from around 40 s.

## Problems
- **Cut the start**: 0.00–12.90, "Haloo?" and silence.
- **Silent gaps** at 28.28–32.33, 41.82–46.68, 53.06–57.08, 63.09–69.98 and 97.19–102.53. The clean voice is around -90 dB there: true silence, no noise. Any music must come from the inserts' own audio (see Inserts).
- **Retake of the drone line**: use **take 2, 57.14–63.00**. It is concrete ("drone lentää puuhun") and fluent. Take 1 (46.24–53.00) drags on "tässä" (49.36–50.24) and uses an awkward compound. Cut 46.2–57.1.
- **Ending recorded twice** (69.46–97.28, then 102.10–120.08). Best parts:
  - **No stock or AI music can do it**: use 69.46–77.78. It adds the AI point that 102.10–106.42 lacks. Tighten by starting at "mitä ei" (71.14) or keeping "Ja tää on". Drop "silleen" plus the pause (about 71.42–72.54; silence 71.94–72.54; check with `level`).
  - **Fun to make**: use 78.56–84.90 (with "nyplätä"), not 112.62–114.94. "silleen" (80.46–81.68) holds a pause at 81.22–81.75 that can be cut.
  - **The result**: use 88.26–89.58 "Mä niinku sytyn ite siitä", plus 90.44–93.08 if wanted. Cut 85.08–88.15 (trails off: "jotenkin, en mä tiedä"). Cut 107.60–109.34, a false start ("Ja mun mielestä toi on niinku,"). The redo at 109.64–111.94 duplicates 90.44–93.08.
  - **Nobody else does it**: use 94.74–97.28 "mä en oikein törmännyt siihen, että kukaan muu tekisi niinku tällaista" and drop the "Ja sit mä en tiedä," before it. Do not use 114.94–120.08: it is split by a pause (116.66–117.69) and ends on a repeat ("Mä en oikein törmännyt.").
- **Fillers**: "niinku" at 70.50, 84.12–84.68, 88.28, 92.34, 96.48, 103.80; "silleen" at 71.42 and 80.46; "en mä tiedä" at 87.30–87.58.

## Hook
1. **12.94–15.84 "Mä teen mun videoihin musat ite."** The premise in one short, clear line. Open on it.
2. **75.74–77.78 "ei oikein tekoälylläkään pysty tekee"** (with 71.14 "mitä ei valmis stokki musiikille pysty tekee"). A contrarian claim. Better as the closing punch than as the opener.
3. **60.72–63.00 "missä mulla drone lentää puuhun"** with the drone-crash insert. The most visual moment, a possible cold open if moved to the front.

## Framing
The camera is natively 9:16 (2160×3840). At `zoom: 1` the crop is the whole frame, and x and y do nothing. He sits left of centre. Read off `frame main`:

| s | face x | y (a little below the eyes) |
|---|---|---|
| 5 | 560 | 1600 |
| 14 | 700 | 1500 |
| 30 | 590 | 1480 |
| 44 | 710 | 1300 |
| 55 | 690 | 1250 |
| 66 | 820 | 1250 |
| 90 | 950 | 1300 |
| 115 | 820 | 1290 |

From around 40 s on he leans in (face higher and larger) and drifts right to x 800–950.

Suggestion: `framing: { x: 820, y: 1300, zoom: 1.2 }`. At 1.25 the crop is 1728×3072 and clamps to x ≥ 864, y ≥ 1536, so it sits top-left. Checked with `frame musat main 55 36,0,1728,3072`: the face is in the upper middle, slightly left, and the gesturing hand is partly cut on the right. That is fine. Above about 1.3 his hand gestures get lost.

## Emphasis (word times, transcript.json; starts may be 0.2–0.35 s late)
- 14.58–15.84: "musat ite" (hook)
- 20.62–22.52: "täydellisesti siihen kuvaan"
- 26.38–27.44: "intensiivisempää"
- 34.10–34.98: "musakin rauhoittuu"
- 61.30–63.00: "drone lentää puuhun" (only if no full insert covers it)
- 73.08–74.32 "stokki musiikille" and 75.74–77.78 "ei oikein tekoälylläkään pysty tekee"
- 88.52–89.58: "sytyn ite siitä"
- 95.84–97.28: "kukaan muu tekisi niinku tällaista"

## Inserts
All three are `screen/`, 1920×1080, 30 fps. They are DaVinci Resolve with the program viewer (top right) playing his cycling edit and the music on track A3 below.
- A screen-recorder overlay shows at 0–about 0.5 s and in the last second of each file. Use them from 1.0 s to about 1 s before the end.
- **Their audio is the music being talked about**, and the camera is silent during each example. To be heard, the insert's audio must be added in Kdenlive (plan inserts are silent). Plan segments can keep the camera's silent gap under each insert so the music has room.
- **Look**: `fit` (the screen default) shows the whole Resolve window across 1080 px, so the viewer would be only about 333 px wide. Better: `full` with `box: [1060, 123, 593, 335]` (the program viewer, checked with `frame musat screen/drone-onnettomuus.mp4 3 1060,123,593,335`). The code zooms about 1.03×, so it shows a 593×1053 column. The viewer fills the frame's width in the upper third, and the music waveform is below it, which shows the intensity. It is soft either way: the viewer is a downscaled preview, upscaled about 1.8×.

**korkea-intensiteetti.mp4** (0:13.2)
- Picture: 1–3 s POV of a gravel road; 3–9 s group riding with bikes close by; 10–12.5 s a rider's face, riding.
- Music: intense the whole time.
- Goes with 23.10–28.20 "jos ajetaan kovaa... intensiivisempää, niin kuin tässä", running into the gap 28.28–32.33. Use from 1.0 s.

**intensiteetin-muutos.mp4** (0:14.8)
- Picture: 1–5 s an aerial of a lake in forest; 6–13 s an aerial of a forest path.
- Music: calm, then jumps loud at about **5.1 s**.
- Goes with 32.24–41.72 "rauhallisempi kohta, musakin rauhoittuu... siirtymät... muuttuu intensiivisemmäksi, niin kuin tässä" and the gap 41.82–46.68. Place it so the 5.1 s jump lands just after "niin kuin tässä" (41.72). For example, `at` 39.0 with `from` 2.3, running into the gap. Or start it at 32.24 from 1.0, which puts the jump around "siirtymät" (36.5).

**drone-onnettomuus.mp4** (0:14.1)
- Picture: 1–3.5 s drone flying low over spruce trees; 4–5 s tumbling, sky; about 6 s dark; **7.0 s the crash (blur)**; 8–12.5 s stuck in branches.
- Music: full until about 6 s, then cuts out at the crash (about 7 s) to a quiet tail.
- Goes with 57.14–63.00 "...drone lentää puuhun" and the gap 63.09–69.98. For example, start at about 60.7 from 2.5 so the crash and the music stop land about 2 s after "puuhun".

## Caption spelling (project.yaml `replace`)
- `stokki musiikille: stokkimusiikille`
- Optional, check by ear: `niin kuin: niinku`. Whisper wrote "niin kuin" (27.82, 41.26, 48.70, 59.72) where he speaks colloquially and says "niinku" elsewhere.
- "Kampiapina" isn't said. The existing entries are enough.
