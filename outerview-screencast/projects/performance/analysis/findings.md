# performance: findings

Sync: the screen recording starts at **-26.1 s** of the face recording (`synced: manual`). The sound match's value was checked by eye and lines up within ~0.3 s:
- the Performance click at 50.5 during "performance-kohdasta" (50.1–51.4)
- the AI Analysis tab at 121.0 on "analyysinäkymä" (120.5–121.3)
- the workspace switch at 152.5–154.5 and team Performance at 156.5 during "mä otan tämän meidän tiimin performansen" (153.7–158.3)
- the time-range bar at 58.5–61 on "aikajänteen"
- the pointer on the growth curve's jump at 88.3 on "otettu meidän oma työkalu käyttöön"

The screen covers -26.1…297.0 and the face 0…291.9.

## What it is

A Finnish screencast: Jaakko shows Outerview's new **Performance** analytics (beta), first for his own LinkedIn posts (Overview, AI Analysis) and then for the team workspace (team Overview, Top lists, Standout posts). It's for Outerview users and LinkedIn posters. He starts on camera in a phone booth, then moves to the desk and talks over the screen.

## Timeline

| Time (s) | Said | Screen | Face |
|---|---|---|---|
| 0–11.5 | nothing | start page (fullscreen browser) | close-up, adjusting, looks off to the side |
| 11.5–32.5 | "Moikka! Täällä mä oon taas hapettomassa kopissa selittämässä…", what Outerview is (interviews users, makes LinkedIn content), "julkaistu… performance-… analytiikkatoiminto, mä näytän vähän miten se toimii" | start page | to camera, centred, wall behind, hands together: good |
| 32.5–46.8 | nothing (handling noise 33.5–34.8) | start page | grabs the phone (32.5), carries it to the desk; from 34 on a low angle from the left, window behind; hand at the lens around 40 |
| 46.8–52.5 | "löytyy täältä valikosta, performance-kohdasta, mennään sinne" | pointer to sidebar Performance, click 50.5, Performance page from 51.5 | looks at the screen (right) from here on |
| 52.5–61.9 | best posts of the last 3 months; another range can be chosen | Top posts 377/347/200; pointer by the range buttons at 58.5–61 | |
| 62.6–83.6 | basic stats: posts, reactions, comments; cumulative curve, how posting and reactions developed | scrolls: stats 50 / 3,039 / 705, Growth 3,744, hover on the chart (68) | |
| 83.7–91.4 | "arvatkaa missä kohtaa on otettu meidän oma työkalu käyttöön" | Growth curve; pointer at the jump on the right (88.3) | smiles |
| 92.2–106.9 | ICP: ideal-customer-profile matching contacts, more in another video | Contacts 791 / Possible leads (ICP ≥ 70%) 182 | |
| 107.9–117.4 | how often I post, what topics | scrolls to "How often are you posting" 3.8/wk, "What do you talk about" | |
| 118.0–118.75 | unclear short sound or word (Whisper: "Kiitos, että katsoitte") | scrolls to top | mouth moves |
| 119.1–128.4 | "Täällä on myös tällainen analyysinäkymä…" what works and what doesn't | AI Analysis tab clicked 121.0: "Your best posts put you inside the scene…", +47% | |
| 128.9–129.7 | aside "Joo totta" (loud) | same | |
| 130.0–147.2 | the overview: putting yourself on the line works; these kinds of content get more or fewer views | scrolls: 1.8× / +8%, "What your best posts do" (4.2×, 7.9×), "What your quiet posts do" | |
| 147.2–160.8 | this is personal; with a team… "otan tämän meidän tiimin performansen, tämä on mielenkiintoinen" | workspace menu 152.5, team "Outerview" 154.5, team Performance 156.5 (97 posts / 4,884 / 1,484, Growth 6,368, Contacts 1,029/240) | |
| 161.7–174.9 | the same at team level: how much the team posted on LinkedIn, reactions | team Overview scrolling (Posts per week) | |
| 174.9–194.4 | "kaikista tärkein… kilpailu motivoi… toplistoja"; whole-team comparison; joke "en tee tätä videota siksi että voin itse olla ykköspaikalla" | Top lists tab (175): Leaders You 5,949 / Julius 3,214 / Mikael 1,599 points; Who's carrying the team | |
| 194.4–195.6 | laughs (Whisper: "Kiitos, että katsoitte!") | | laughing |
| 195.7–212.1 | "ei vitsi vitsi", posted, reacted, commented; "Juliuksen postaukset saa selkeästi enemmän kommentointia kuin meikäläisen" | Leaders switched Posts, Reactions, Comments (Comments clicked ~205: 705 / 540 / 239) | |
| 212.9–220.7 | if you post on LinkedIn systematically, here you see where we really are | scrolls to the Everyone table, back up | |
| 220.7–228.5 | "Mun mielestä nämä," abandoned, then a 5 s wait | Standout posts tab clicked ~222–226 | |
| 228.5–237.9 | "täältä pääsee sukeltaan vielä yksityiskohtaisemmin… yksittäisiinkin postauksiin" | Everyone's best post cards, scrolls (233.7) to the Standout posts list | |
| 239.4–248.9 | closing take 2: "…paremmat kuin LinkedInin omat näkymät… käyttäjille. Käyttäjille tuota…" (breaks down) | static Standout posts | |
| 248.9–260.0 | silence | static | |
| 260.1–269.9 | closing take 3: "…parempia kuin LinkedInin omat analytiikkanäkymät, ja täältä näitä…" (breaks off) | static | |
| 269.9–274.9 | silence | static | hands together, looks at the camera |
| 274.9–288.7 | closing take 4, complete: "Mun mielestä nämä näkymät, vaikka niin kuin itse sanonkin, on parempia kuin LinkedInin omat analytiikkanäkymät, ja täältä niitä Outerviewn uumenista saa, jos kiinnostaa. Oman tuotteen kehuminen päättyy tähän." | static | to camera, hand gestures |
| 288.7–291.9 | silence, end | | |

## Problems

- **0–11.5:** silence while he settles. Cut.
- **14.98–15.62:** false start "miten meidän tuote…" running into "Tää on siis…" (15.52). There is no silence there: cut after "selittämässä" (14.9) and check with `level` 14.8–15.7, or keep it as it is.
- **32.5–46.8:** he grabs the camera and moves to the desk, with handling noise 33.5–34.8 (Whisper "Kiitos.") and no speech. Cut it all. Silence 32.51–33.45 is where the intro ends.
- **92.24–92.66:** false start "Sitten meillä". Start at "Tästä" (~92.66; no silence, check `level`).
- **118.0–118.75:** short loud sound or word, captioned wrongly as "Kiitos, että katsoitte." Cut. Quiet 118.77–118.99, then "Täällä" from 119.08.
- **128.9–129.7:** "Joo totta", an aside, louder than the talk. Cut. Quiet 129.70–130.53.
- **186.0–186.8, 197.5–198.2, 203.6–204.2, 205.0–206.1:** short pauses inside sentences. Keep or tighten.
- **194.4–195.6:** a laugh after the "ykköspaikalla" joke, captioned wrongly as "Kiitos, että katsoitte!". The laugh can stay, but give the segment `text` (or end the caption at "ykköspaikalla").
- **220.7–228.5:** the abandoned "Mun mielestä nämä," plus a 5 s wait while he clicks Standout posts. Cut. Quiet 223.07–228.75.
- **Retakes of the closing line:**
  - take 1, 220.7–224.3: abandoned
  - take 2, 239.4–248.9: ends in "Käyttäjille tuota…"
  - take 3, 260.1–269.9: breaks off
  - take 4, **274.9–288.7**: complete, fluent, to camera. Keep take 4. Cut 238.1–274.8, which also holds the silences 248.6–260.0 and 269.65–275.4 and a false "Kiitos, että katsoitte" at 268.4.
- **Pink highlight rectangles** are recorded into the screen video itself (e.g. 48.0 near Photos/Performance, 57, 99.5, 140, 185, 236). They can't be removed. A zoom elsewhere hides some.
- **Private:** nothing in the usable range. Colleagues' names, photos and posts (Julius Haukkasalo, Mikael Toivio) are on screen from 154.5 to the end; the user has OK'd them. The screen before 0 s (OBS, browser tabs) and after 293.7 s (browser tabs including mail and WhatsApp) is outside the face recording: don't use it.
- **No noise** beyond the above. The voice is clean (lapel mic).

## Intro and outro

- **Intro:** 11.5–32.5 on `face`, "Moikka!" to "…miten se toimii.". It's framed well: centred, to camera, plain wall. It ends cleanly in the silence 32.51–33.45, before he reaches for the phone (32.5; check the last frame).
- **Outro:** take 4, 274.9–288.7 on `face`, ending at "…päättyy tähän." (quiet from 288.74). The framing is acceptable but weaker than the intro: the desk camera is low and from the left, with a bright window behind, and he looks at or near the lens with hand gestures. It's fine to close on. The screen behind is static, so `screen` would also work.
- **Demo:** 46.8–237.9 on `screen`. He looks to the right at the monitor throughout; fine for the corner.

## Moments to zoom

All boxes were checked with `frame performance screen <t> x,y,w,h`.

| When (s) | Box | Why |
|---|---|---|
| 54.0–59.5 | [580, 195, 1020, 575] | Top posts (377/347/200) and the stats row, on "parhaiten menestyneet postaukset" |
| 84.5–90.8 | [590, 300, 1000, 450] | the Growth curve and its jump on the right, on "arvatkaa missä kohtaa on otettu meidän oma työkalu käyttöön" (pointer there at 88.3) |
| 99.5–104.5 | [590, 360, 1000, 563] | Contacts 791 / Possible leads (ICP ≥ 70%) 182, on the ICP explanation (scrolls from 104.5) |
| 122.0–128.0 | [590, 190, 1000, 563] | AI Analysis: "Your best posts put you inside the scene…" and +47% |
| 137.0–142.5 | [590, 360, 1000, 563] | "What your best posts do" / "What your quiet posts do", on "tämän tyyppiset sisällöt saa enemmän näyttöjä…" |
| 185.0–191.0 | [590, 200, 880, 495] | the team Leaders podium (You 5,949 / Julius 3,214 / Mikael 1,599), on "koko tiimin vertailu ihmisistä" |
| 204.3–209.8 | [590, 200, 1000, 557] | Leaders by Comments (705 / 540 / 239), on "Juliuksen postaukset saa selkeästi enemmän kommentointia" (this box includes the Comments tab at 1515,240) |
| 236.2–237.9 | [590, 170, 1000, 563] | Standout posts list. Short: only if the segment runs on; it is still at 239.3 |

Skip 62–83: the page scrolls throughout.

## For the titles

- **Core idea:** Outerview's new Performance view shows how your and your team's LinkedIn posts do (top posts, growth, ICP leads, AI analysis of what works, team leaderboards), better than LinkedIn's own analytics.
- **His words:** "performance-analytiikkatoiminto", "analyysinäkymä", "tiimin performance", "toplistat", "kilpailu motivoi", "paremmat kuin LinkedInin omat analytiikkanäkymät", "ICP-profiili", "käppyrä".
- **Names:** Outerview, Performance (BETA), AI Analysis, Top lists, Standout posts, LinkedIn, Maya, ICP, Julius.

## Caption spelling

- hapettamassa koopissa: hapettomassa kopissa
- keuhuminen: kehuminen
- performansen: performancen
- käppärää: käppyrää
- videomaan: videota
- Outerviewn: Outerviewn (correct; Whisper got it right here)

The project's `replace` already maps Audiview/Audaview/Audioview/outer view → Outerview and Maija → Maya.

Fix with segment `text` rather than replace:
- **24.1:** "esimerkiksi LinkedInin." should read "esimerkiksi LinkedIniin."
- **27.1:** "performance-erityinen analytiikkatoiminto" is uncertain; listen.
- **284.9–288.7:** should read "jos kiinnostaa. Oman tuotteen kehuminen päättyy tähän."
- **195.0:** drop "Kiitos, että katsoitte!"; it's a laugh.
