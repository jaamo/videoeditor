Verdict: FIX

Times are of the video (no opening title, so the cut starts at 0). Times in plan.yaml are seconds of the main recording.

## must

1. **0:02.6–0:04.2: a clipped word and the end of a false start (segments 1/2).** Segment 1 ends at 14.63, which is the "tt" stop inside «selittämässä», so the viewer hears «…kopissa, seli–». Segment 2 starts at 15.65, which is not at «Tää» but in the middle of the rest of the sentence, «[Out]erview toimii.». The two Whisper runs on the cut heard «selit Auterview toimii. Tää on siis…». The voice is continuous from 12.6 to 17.3, so there's no quiet to cut in before «Tää». The real words are «Täällä mä oon taas hapettomassa kopissa selittämässä, miten meidän tuote Outerview toimii. Tää on siis työkalu…», which make a natural sentence. So keep the whole sentence and make the boundary seamless (the segments touch, so no cut is heard):
   - segment 1: `to: 14.63` → `to: 16.86` (the dip between «toimii.» and «Tää»), and add
     `text: Moikka! Täällä mä oon taas hapettomassa kopissa selittämässä, miten meidän tuote Outerview toimii.`
   - segment 2: `from: 15.65` → `from: 16.86` (keep its `text` as it is).

## should

2. **1:37.9: a stray «Joo» caption.** Most of «Joo» (from "Joo totta", 128.29–129.27, which was cut out) falls in segment 6. Its caption shows as "Joo Tuossa on yleiskuva," at the start of segment 7, although nothing is heard. Give segment 6 its words:
   `text: Täällä on myös tällainen analyysinäkymä, eli sitten analysoidaan niitä mun postauksia, miten ne on menestynyt, minkä tyyppiset sisällöt toimii, minkä tyyppiset sisällöt ei toimi.`

3. **3:08.3: a stray «Mun» caption.** «Mun» from the abandoned "Mun mielestä nämä," (220.70–221.68, which was cut out) falls in segment 9. It shows as "Mun Ja sitten täältä" at the start of segment 10. Split segment 9 where it's quiet so the last phrase can have its own text, without the captions drifting over the long segment:
   - segment 9: `to: 220.78` → `to: 218.40` (keep its zoom).
   - add a segment right after it: `from: 218.40`, `to: 220.88`, `layout: screen`, `text: että missä me oikeasti mennään.`. 220.88 is in the quiet after «mennään.» and gives a cleaner tail than 220.78, which was only 0.03 s after it.

4. **1:03.9: segment 4's caption is missing words.** Both Whisper runs on the voice hear «Sitten meillä on tämmönen, tästä mä selitän…». In segment 4's `text`, change «Sitten meillä, tästä mä selitän» → «Sitten meillä on tämmönen, tästä mä selitän» and leave the rest as it is.

5. **1:38–1:44 and 2:15.8: segment 7's captions are wrong in places.** Whisper on the voice hears «Tuossa on tämmönen yleiskuva, ja jos laittaa itsensä niin sanotusti peliin». The captions say «Tuossa on yleiskuva» and «niihin peliin». «niihin» is used correctly later in the same segment («on niihin reagoinut»), so a `replace` won't do. Split the segment at the quiet after «paremmin.» (the segments touch, so nothing is heard):
   - segment 7: becomes `from: 130.45`, `to: 136.15`, `layout: screen`, `text: Tuossa on tämmönen yleiskuva, ja jos laittaa itsensä niin sanotusti peliin, niin se yleensä toimii paremmin.`
   - a new segment: `from: 136.15`, `to: 184.15`, `layout: screen`, with segment 7's zoom (137.0–142.5) moved into it.
   - also «linkkaria» at 2:15.8 is said «linkkariin» (both Whisper runs agree): add `linkkaria: linkkariin` to plan.yaml `replace`.

## could

6. **3:17.3–3:20: segment 11's word order.** Two Whisper runs on the cut hear «Mun mielestä nämä näkymät on, vaikka itse sanoinkin, parempia…», with «on» before «vaikka». The `text` has «näkymät, vaikka niin kuin itse sanonkin, on parempia». Listen. If «on» does come first, change it to «Mun mielestä nämä näkymät on, vaikka niin kuin itse sanonkin, parempia kuin…».
7. **2:36: segment 8 has «tätä videota» in its text.** It was heard as «tämän videon» / «tää videomaa». Listen and match the text if it's clearly «tämän videon».
8. **0:00.0: the first frame is black.** It's a single frame before the face comes in. It's barely visible; leave it unless it shows up as a flash in players.

## Checked and fine

- All other cut edges are in quiet (by `level`): 47.55, 91.48, 106.95/107.72, 117.55/118.88, 128.42/130.45, 228.65, 238.05, 275.3, 288.85. Accepted as you planned: «Sitten meillä» at ~92.1, and the pauses at 186.0–186.8 and 205.0–206.1.
- Nothing is said twice, and no retakes are left in.
- Sound: -16.3 LUFS and a true peak of -2.5 dBFS, both fine. No silence in the cut is over 1.2 s.
- Frames: the layouts are as planned, and the face→screen and screen→face changes happen at the turns in the talk. All 7 zooms are on what's being talked about and settle sharp: Top posts, the growth curve, Contacts/leads, the AI summary, best posts, the Leaders podium and Leaders by comments. The face's corner doesn't cover the zoomed content. Captions are readable and clear of the face. The end card reads «Kokeile itse – outerview.app».
