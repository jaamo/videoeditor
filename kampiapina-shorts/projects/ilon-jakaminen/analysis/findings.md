# ilon-jakaminen: findings

## What it is
A cyclist's selfie talk, shot outdoors on a park path in a helmet and hi-vis jacket. The point: be kind to people walking (slow down, ring the bell) and they thank you for it. "A free way to give people a good feeling, and yourself too." For everyday cyclists. In Finnish. 51.5 s, one take, no retakes.

## Timeline
Camera seconds. Text is Whisper's, with likely corrections in [brackets]. Speech actually starts at 1.70 (Whisper says 1.20).

- 0.00–1.68 silence, framing himself.
- 1.70–3.45 "Mä oon täällä taas jeesustelemassa." He gestures at himself with his hand (0–5 s).
- 3.6–6.25 "Olin sunnuntaina [pari päivää sitten?] pyörälenkillä." Whisper heard "paripäiväiset".
- 6.80–9.34 "Oli koiranulkoiluttaja[-ia] tuossa." There's a hitch inside it (dip 7.10–7.25, quiet 7.81–7.98). Hand in front of the lens at about 13–15 s.
- 9.4–12.5 "Hidastin tosi paljon vauhtia ja kiersin ne varovasti."
- 12.7–16.1 "Hän kiitti oikein ääneen siitä, että hidastin vauhtia."
- 16.5–18.8 "Sitten äsken olin tämmösellä ulkoilutiellä."
- 18.9–21.3 "Oli koiranulkoiluttajia eri puolilla tietä." Whisper heard "koiraa ja koiraa ulkoiluttaen … teitä".
- 21.6–25.1 "Sitten soitin kelloa ja kiitin siinä ohittaessa."
- 25.55–27.8 "Sitten jäin [pause 26.30–26.71] tuohon ulkosalille." He points behind him to the left at about 30 s.
- 27.8–30.8 "Hän käveli mun perässä ja teki semmoisen sadan metrin koukkauksen."
- 30.9–33.7 "Tuli kiittämään mua siitä, että 'kiitos kun soitit sitä kelloa'."
- 33.75–35.6 "Ettei hän kuule, kun pyörät tulee lujaa."
- 35.60–36.45 pause.
- 36.45–42.5 "Mä sanon vaan, että tänä päivänä maailmassa on aika paljon kaikkea negatiivisuutta ja muuta." Halting, with pauses at 38.21–38.65, 39.66–40.28 and 40.91–41.05.
- 42.52–43.34 pause.
- 43.34–46.8 "Tämä on [pause 43.77–44.20] ilmainen tapa saada ihmisille hyvä fiilis."
- 46.95–47.72 "Ja myös itselle."
- 47.72–48.99 pause.
- 49.00–50.5 "Ei voi kuin suositella." Silence to the end (50.53–51.46).

He looks at the lens the whole time and never leaves the frame. The phone is handheld, so the framing drifts all the way through.

## Problems
- **Start:** 0–1.68 silence. Cut in at about 1.65.
- **Pauses to cut** (quiet under -40 in `silences.json`):
  - 6.25–6.79
  - 25.16–25.55
  - 26.30–26.71 (inside "jäin … tuohon")
  - 35.60–36.45
  - 38.21–38.65 and 39.66–40.28 (hesitations in "aika … paljon kaikkea … negatiivisuutta")
  - 42.52–43.34
  - 43.77–44.20 ("Tämä on | ilmainen")
  - 47.72–48.99
- **Possible stumble:** 6.8–8.2, "koira…nulkoiluttaja", with a dip at 7.10–7.25 and quiet at 7.81–7.98. Listen; it may need a cut at 7.81–7.98.
- **Few quiet gaps elsewhere:** he talks fast, and most of the joins between sentences never drop below -40. For example, 16.10–16.45 is at -28 to -40, which is breath or wind. Cut at dips: 16.45, 17.15, 19.15, 31.15, 31.45, 32.20.
- **Off-topic or slack:** "Mä sanon vaan, että …" (36.45–36.9) is a filler lead-in. The first anecdote (3.6–16.1) repeats the point of the second (16.5–35.6). Dropping it gets a tight cut of about 30 s. Keeping both gives about 42 s.
- **Noise:** voice isolation was refused, so this is the raw phone mic with a noise filter. Expect wind or ambience under the speech.
- No retakes.

## Hook
1. **"Tämä on ilmainen tapa saada ihmisille hyvä fiilis. Ja myös itselle."** (43.34–47.72, pause 43.77–44.20 cut out). The message in one line. Strongest; can be moved to the front.
2. **"Tuli kiittämään mua siitä, että kiitos kun soitit sitä kelloa"** (30.9–33.7). A surprising, concrete moment: someone walked 100 m back to thank him.
3. **"Mä oon täällä taas jeesustelemassa."** (1.70–3.45). A playful opener in his own voice, already at the start, so it works if the order is kept.

## Framing
Camera 2160×3840 (already 9:16). At zoom 1 the crop can't move, so use zoom 1.25 (crop 1728×3072, middle x 864–1296). The face is right of the middle, so x clamps at about 1296. That's fine: the face stays fully inside.

| Time | Face middle x | y (a little below the eyes) |
|---|---|---|
| 2 s | about 1300 | about 1600 |
| 14 s (leaning close) | about 1500 | about 1350 |
| 30 s | about 1650 | about 1500 |
| 44 s | about 1600 | about 1400 |

- **Suggestion:** `framing: { x: 1550, y: 1500, zoom: 1.25 }`; x is clamped to 1296.
- **Checked:** box 432,578,1728,3072 at 2 s and 30 s, with the face fully inside in both and the captions' area over the chest.
- **Movement:** the phone drifts; the head is higher and closer at about 10–16 s. One framing works throughout.

## Emphasis
1. **"ilmainen tapa saada ihmisille hyvä fiilis"**
   - Whisper: "ilmanen" 43.50, "fiilis" end 46.60.
   - By level: "ilmainen" starts at 44.20, the phrase ends about 46.65.
   - Zoom 44.18 → 46.65, ×1.2.
2. **"kiitos kun soitit sitä kelloa"**
   - Whisper: "kiitos" 32.28, "kelloa" end 33.66.
   - By level: it starts after the dip at 32.20 and ends about 33.70.
   - Zoom 32.20 → 33.70, ×1.15.

## Inserts
None (no b-roll or screen files).

## Caption spelling
Likely corrections, from context (not confirmed by ear):

- Jeesustelmassa: jeesustelemassa
- paripäiväiset: pari päivää sitten (unsure; check by ear)
- koira ulkoilut ja koira: koiranulkoiluttaja (6.9–9.0)
- koiraa ja koiraa ulkoiluttaen: koiranulkoiluttajia (19.2–20.4)
- teitä: tietä (21.06)
- koukkuaukseen: koukkauksen
- ilmanen: ilmainen
- Ei voinut kuin: Ei voi kuin (check by ear)
- tämmösen ulkoilutiellä: tämmösellä ulkoilutiellä
- siihen, että: siitä, että (31.94)
- Että ei hän: Ettei hän

Fix the multi-word ones on the Subtitles track rather than as `replace` pairs. Safe `replace` pairs: `Jeesustelmassa: jeesustelemassa`, `koukkuaukseen: koukkauksen`, `ilmanen: ilmainen`.
