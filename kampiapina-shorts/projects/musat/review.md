Verdict: FIX

Times are of the video (= the cut). Checked: `review/report.md`, all sheets, frames at each insert's edges and around both zooms (`review/frames/out-*.jpg`), the voice level at every cut, and the loudness of each stretch in `out.mp4`.

## What's right

- **Screen inserts** (15.07–18.67, 26.93–33.10, 39.00–45.63): each is a single fixed Transform. Resolve's program viewer fills the frame's width from the insert's first frame to its last. The whole Resolve window never shows small. Below the viewer, the timeline and music waveform show, and the captions sit over the timeline, clear of the picture. The screen-recorder overlay doesn't show.
- **Insert sound**: each insert's own audio is in (gain 1). It uses the same source offset as its picture, so it is in sync. The music sits at about -16 to -17 dB RMS against the voice's -18. That's a sensible level: just above the voice, never covering it. The camera voice is silent (about -90 dB) under each example, so the music has room. Insert 3 fades out on its own before the voice comes back at 45.6.
- **Emphasis zooms**: both are hard cuts on held keyframes, with no animation.
  - Zoom 1: ×1.2 at 1.77–3.03 on «musat ite».
  - Zoom 2: ×1.25 at 50.83, held to the cut at 53.17, on «ei oikein tekoälylläkään pysty tekee». It moved from about 46.7 to here with the user's edits, and this is the punchline: good.
  - Both are centred on his face and sharp, because the 4K source is downscaled.
- **Framing**: his eyes are about 30 % down the frame throughout, well clear of the captions at about 1260 px.
- **Captions**: readable, inside the frame, never over his face.
- **Opening**: «Mä teen mun videoihin musat ite.» starts on frame 1, with the zoom on «musat». It hooks within the first second.
- **Sound**: -15.5 LUFS, true peak -2.9 dBFS, no silence over 0.8 s.
- **Grade**: warm and faded but not orange (the hoodie is orange anyway); a light vignette.
- **Retakes**: no retake is left. Take 2 of the drone line was used.

## Issues

1. **should, 14.9 / 27.7 / 35.8: captions (finisher).** He says «niinku», but the captions show «niin kuin». Later captions (46.2, 58.6) do write «niinku». Also, the «niin» and «kuin» words have zero length, so their highlight only flashes.
   - captions.txt [14.88–15.62]: «niin kuin tässä.» → «niinku tässä.»
   - captions.txt [27.66–28.52]: «niin kuin tässä.» → «niinku tässä.»
   - captions.txt [35.76–36.16]: «niin kuin vaikka» → «niinku vaikka»

2. **should, about 47.1: captions (finisher).** «silleen» is kept in the cut (camera 71.45–71.95) but missing from the captions.
   - captions.txt [46.90–48.32]: «mitä ei valmis» → «mitä ei silleen valmis»
   - Or, if he wants the filler gone, cut it in Kdenlive instead. It runs straight on from «ei» with no pause, so the cut would be heard. Captioning it is the better fix.

3. **should, about 55.4: captions (finisher).** «silleen» (camera 80.46–81.2, video about 55.36–56.1) is in the cut but not captioned. While he says it, «tosi» is highlighted.
   - captions.txt [55.34–57.24]: «tosi siisti ite» → «silleen tosi siisti ite»

4. **should, about 62.1: captions (finisher).** He says «tekis niinku tällaista». Both the camera transcript (96.48) and the review hear «niinku».
   - captions.txt [61.86–63.26]: «tekis tällaista.» → «tekis niinku tällaista.»

5. **should, 0:33.10: Kdenlive (user).** The camera clip after insert 2 starts on the "T" of «Tai» (camera 57.07). The voice there is -85 dB at 57.05 and -13 dB at 57.10. The render's 3-frame fade-in softens the word, and the review heard only «Sit». The fix:
   - Roll the cut between the camera clips at 0:33.10 three frames earlier: end the previous camera clip at 0:33.00 and start this one at camera 56.97 s. The previous clip's tail is silent there (-90 dB).
   - Keep the voice grouped with it. Insert 2 can stay to 0:33.10 or end at 0:33.00.

6. **should, 4.1–4.98 and 20.4–21.38: captions (finisher).** He doesn't say these words:
   - captions.txt [4.08–4.98]: «siinä on siistiä se,» → «siinä on niinku siistiä se,»
   - captions.txt [4.98–5.28]: «että mä voin» → «et mä voin»
   - captions.txt [20.38–21.38]: «musakin rauhoittuu.» → «musiikkikin rauhoittuu.»

7. **should, 37.92–39.5: captions (finisher).** The video says «drone, joka lentää puuhun», but the caption says «drone lentää puuhun».
   - captions.txt [36.74–37.92]: «missä mulla drone» → «missä mulla on drone,»
   - captions.txt [37.92–39.50]: «lentää puuhun.» → «joka lentää puuhun.»

8. **could: captions (finisher).** He speaks colloquially, and other captions keep it («ite», «tekee», «sellas», «tekis»). These are written forms instead:
   - captions.txt [12.38–12.96]: «niin sitten musa» → «niin sit musa». «sitten» is timed at 0.06 s, so it's a short word.
   - captions.txt [57.24–58.50]: «tehdä ja nyplätä.» → «tehä ja nyplätä.»
   - captions.txt [60.32–60.60]: «Mä en oikein» → «Mä en oikeen»
   - captions.txt [60.60–61.22]: «törmännyt siihen,» → «törmänny siihen,»

9. **could: captions (finisher), check by ear.** The review's Whisper heard «niinku» at four places that are not captioned. The camera transcript doesn't have them, so they may be invented. The long word times (and three bursts of voice under «just») hint they may really be said. If you hear one, add it:
   - 4.4: «siinä on niinku siistiä», [3.74–4.84]
   - 6.9: «niinku just täydellisesti», [6.96–8.46]
   - 33.9: «lähteä niinku leikittelemään», [33.88–34.96]
   - about 54.0: «tätä on myös», [53.98–55.34]

10. **could: caption timing (finisher).** Two caption words come up before he says them. Fix only if captions.txt timing can be changed; the file says to leave times.
    - «Tai» is highlighted from 32.52, over the drone insert, but is said at about 33.12: start [32.52–33.50] at 33.12.
    - «Ja» shows from 45.36, still over insert 3, but is said at about 45.70: start [45.36–46.22] at 45.65.

11. **could, 28.1–29.8: Kdenlive (user).** Under insert 2, Whisper hears «Ja ei tarvi enää tulla paikanpäällä». His voice is silent there (-90 dB), so it comes from the screen recording itself: the example video's own clip audio, playing in Resolve. It's part of the example and isn't captioned, which is right. If he doesn't want a second voice there, use a stretch of `intensiteetin-muutos.mp4` without it, or lower that insert's gain. The music is 1–2 dB above the voice here anyway.

12. **could, 0:45.63 and 0:58.40: Kdenlive (user).** These camera clips start only 0.02–0.05 s before the word («Ja» at camera 69.97, «Mä» at camera 88.15), so the fade-in grazes it. Both words are heard fine. If wanted, roll each cut 2 frames earlier, as in issue 5: the tails before them are silent.
