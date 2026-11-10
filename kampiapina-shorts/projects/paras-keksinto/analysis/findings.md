# paras-keksinto: findings

## What it is

A Finnish talking-head short for cyclists and bike commuters. The speaker (green jacket, Giro helmet, outdoors in a park with office buildings behind) says the inline cable tension adjuster at the front end of the gear cable is the most brilliant invention in cycling history, because it lets you fine-tune the gears while riding without stopping. The camera file is three takes joined into one, with the joins at about 10.80 and 34.93. There is no b-roll and no screen recording.

## Timeline (camera seconds)

**Take 1 (0–10.80): selfie talking head**
- 0.00–2.95: silence and room noise. Whisper's "Kiitos" here is invented.
- 2.95–8.62: "Haluatteko tietää, mikä on mun mielestä pyöräilyhistorian ja teknologian nerokkain keksintö?" He gestures with his right hand.
- 8.95–10.25: "Se on tämä." He reaches to his left toward the bike.
- 10.25–10.80: quiet.

**Join at 10.80:** the picture cuts to the phone pointed down at the bike. There is no face from here to 34.93. Same speaker, same place.

**Take 2 (10.80–34.93): view down at the bike**
- 10.80–15.25: the hand finds the adjuster. Only handling noise at -41 to -45 dB; Whisper's "Kiitos" here is invented.
- 15.30–19.90: "Vajerin kireyden säädin täällä vajerin etupäässä." He points at the barrel adjuster on the down tube, near the head tube. There is a pause of about 0.6 s at 17.85–18.46.
- 20.30–20.45: a sharp click at -10 dB, not speech.
- 21.45–33.35: "Tässähän on se hyvä puoli, että kun ajan ja jos vaihteet eivät ole ihan vireissä, niin mä pystyn tässä ajaessa säätä(mään) ja hienosäätämään vaihtajan toimintaa."
  - The picture shows a close-up of the hand on the adjuster (about 20), the stem and the bike computer (about 25–27), then the hand back on the adjuster (about 30–34).
  - There are pauses at 29.06–29.83 (about 0.75 s, inside "ajaessa") and 26.93–27.09.
- 33.40–34.93: quiet.

**Join at 34.93:** the picture cuts back to a selfie. Same speaker and place. The face sits lower in the frame than in take 1.

**Take 3 (34.93–75.0): selfie talking head**
- 36.20–38.30: "Käytännössähän se tarkoittaa aina..." He stops (start 1).
- 39.62–42.45: "Käytännössähän se tarkoittaa aina vaihty..." He slips (start 2).
- 44.40–50.25: "Käytännössähän se tarkoittaa aina vajerin kiristämistä, koska ei se vajeri itsestään kiristy, mutta se kyllä itsestään löystyy." This is the good take.
- 50.65–55.58: "Eli katsoa vaan etukäteen, että kumpaan suuntaan tätä pitää säätää, että se vajeri kiristyy."
- 55.58–61.78: "Jos vaihteet eivät toimi, neljännes kierros kerrallaan, pikkuhiljaa kiristää silleen, että oikea kohta löytyy." He makes a turning gesture with his hand.
- 61.85–63.55: "Ajaessa ei tarvitse pysähdellä,"
- 63.60–65.60: "ei tarvitse säätää sitä tuolta takaa,"
  - **The camera swings down and back at 63.5–66.3:** the picture is blurred, the face is half out or out of frame, and he points at the ground behind him, toward the rear derailleur.
- 65.90–67.25: "lähteä liikkeelle ja kokeilla." The face is back in frame from about 66.3, closer and higher than before.
- 67.40–70.20: "Voi sen ajaessa vaan säätää sen kohdilleen." There is a pause of 0.4 s at 68.44–68.84.
- 71.25–71.55: "Täydellinen." (first try)
- 72.30–73.15: "Täydellinen keksintö." This is the ending.
- 73.2–75.0: noise. Whisper's "kun katsoit" is invented.

## Problems (cut these)

- **Dead air:**

  | Range | What it is |
  |---|---|
  | 0.00–2.95 | before the first word |
  | 10.25–15.25 | end of take 1 and the hand settling in take 2 |
  | 33.40–36.15 | end of take 2 and start of take 3 |
  | 70.20–71.20 | before the first "Täydellinen." |
  | 73.20–75.0 | after the last word |

- **Retakes in take 3:**
  - Start 1 (36.15–38.35) and start 2 (39.55–42.50, a slip on "vaihty...") are out. Keep start 3, from 44.40: it is the only complete one.
  - Cut in the quiet at about 44.35. There is a blip of -39 dB at 44.25, so don't cut at 44.2.
- **"Täydellinen." said twice:** cut the first one (71.25–71.55) and the gap after it (71.6–72.25, noise at about -40 dB). Keep 72.30–73.15 "Täydellinen keksintö." as the last line.
- **Pauses over 0.3 s:**

  | Range | Where |
  |---|---|
  | 17.85–18.46 | before "täällä" |
  | 20.50–21.40 | includes the click at 20.30–20.45 |
  | 29.06–29.83 | inside "ajaessa" |
  | 50.25–50.60 | |
  | 61.70–61.80 | short |
  | 65.60–65.88 | |
  | 68.44–68.84 | |

- **Click:** 20.30–20.45, -10 dB. Keep it out (the take 2 cut can be 19.95 → 21.40).
- **Camera swing (63.5–66.3):** the picture is blurred and the face leaves the frame. There are no inserts to cover it. Options:
  - (a) Cut 63.55 → 67.35. This keeps "Ajaessa ei tarvitse pysähdellä, … voi sen ajaessa vaan säätää sen kohdilleen."
    - Both edges are only short dips: -32 dB at 63.55, and -44 dB at 67.30–67.35. Check both with `level`.
    - This drops "ei tarvitse säätää sitä tuolta takaa, lähteä liikkeelle ja kokeilla."
  - (b) Keep the swing as a gesture that goes with "tuolta takaa". It is motion-blurred for about 2.5 s.
- **Repetition:** take 2 (21.45–33.35, you can tune while riding) and take 3 (61.85–70.20, no need to stop) make the same point.
  - For a tighter story, keep the take 2 line for the "why" and take 3 only to 63.55 ("Ajaessa ei tarvitse pysähdellä").
  - Or keep 67.40–70.20 and drop 21.45–33.35's second half.
- **No fillers to speak of.** "Eli" (50.70) can stay.

**Suggested story** (in recording order, so no reordering is needed): hook (2.95–10.25) → what and where (15.25–19.95) → why (21.40–33.40) → in practice (44.35–61.75) → no stopping (61.80–63.55, then 67.35–70.20 if the swing is cut) → "Täydellinen keksintö." (72.25–73.20). That comes to about 47 s before tightening the pauses.

## Hook

1. **2.95–8.62** "Haluatteko tietää, mikä on mun mielestä pyöräilyhistorian ja teknologian nerokkain keksintö?" A question that creates curiosity, with a big claim, said straight to the camera. It is the natural opener and already comes first.
2. **8.95–10.25** "Se on tämä." The payoff, straight into the take 2 close-up of the adjuster. Keep it right after line 1.
3. **61.85–63.55** "Ajaessa ei tarvitse pysähdellä." The benefit in one line. It is weaker as an opener; use it only if the question feels long.

## Framing

The camera is 2160×3840, so it is already 9:16. At zoom 1 the crop can't move: use zoom 1.15–1.25 for the talking-head parts. The positions below are the middle of the face and a point a little below the eyes, read off `frame main`.

**Take 1 (0–10.8):**

| Time | x | y |
|---|---|---|
| 2.0 | 870 | 1600 |
| 5.0 | 1080 | 1480 |
| 8.0 | 990 | 1420 |
| 10.6 | 930 | 1420 |

Use **x 980, y 1450**. Checked at 5.0 with the box 80,490,1800,3200 (zoom 1.2): the face is high and centred.

**Take 2 (10.8–34.93):** no face; the subject is the adjuster and the hand.

| Time | What | Position |
|---|---|---|
| 15.5 | the adjuster | about x 1200, y 1840 |
| 20.4 | close-up | about x 960, y 2000 |
| about 27 | hand at the stem and bar | about x 1200, y 2300 |
| 33.5 | the adjuster | about x 1350, y 1950 |

Zoom 1 (the full frame) works here. If zoomed, set per segment x about 1150, y about 2000.

**Take 3, 34.93–63.5:**

| Time | x | y |
|---|---|---|
| 36.5 | 1050 | 1720 |
| 40 | 900 | 1780 |
| 47 | 1110 | 1720 |
| 52 | 1080 | 1650 |
| 57 | 810 | 1630 |
| 61 | 1080 | 1500 |

Use **x 1000, y 1680**; at zoom 1.2 the crop is held at the bottom edge. Checked at 47 with the box 100,640,1800,3200: good.

**Take 3, 63.5–66.3:** camera swing, no usable face.

**Take 3, 66.3–75 (closer, higher):**

| Time | x | y |
|---|---|---|
| 68 | 990 | 1200 |
| 71.5 | 900 | 1200 |
| 72.5 | 960 | 1230 |
| 74 | 840 | 1200 |

Use **x 950, y 1220** as framing for this segment. Checked at 70 with the box 50,260,1800,3200: good.

## Emphasis

1. **The hook:** "pyöräilyhistorian ja teknologian nerokkain keksintö?" Whisper puts "pyöräilyhistorian" at 4.30, and the sound ends about 8.62. The tighter option is "nerokkain keksintö" only: 7.28 ("merokkan" in transcript.json) to 8.66 ("keksintä"); by the voice it ends at about 8.62. Zoom 1.2, cut in at about 7.2 and out at 8.65, before "Se on tämä."
2. **The punchline:** "Täydellinen keksintö." Whisper puts it at 72.04–72.72 ("Täydellinen") and 72.72–73.22 ("keksintö"); by the voice it is 72.30–73.15. It ends the short, so hold the zoom (1.2) to the cut.

## Inserts

None. There are no b-roll or screen files. Take 2's view of the adjuster works as the "show me" part, and it also bridges takes 1 and 3.

## Caption spelling

Whisper's mistakes, as `wrong: right` pairs for project.yaml's `replace`:
- merokkan: nerokkain
- keksintä: keksintö
- säänin: säädin
- hieno säätään: hienosäätämään (heard at 30.46–31.26; check by ear)
- säätäen: säätämään (29.74–30.40; check by ear)
- Voisin ajaessa: Voi sen ajaessa (67.50–68.16; check by ear, it may be "Voi sen")

Invented lines to make sure are not in the captions: "Kiitos" (0–2.5 and 13.9–15.3) and "kun katsoit." (73.1–73.7). Kampiapina is not said in the recording.
