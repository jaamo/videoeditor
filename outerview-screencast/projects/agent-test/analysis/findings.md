# Findings: agent-test

## What it is

A short Finnish demo of Outerview (1:25 recorded, about 50 s of speech): the start page, then
starting an interview with your own topic ("tekoälyn aiheuttama identiteettikriisi devaajille")
up to Maya listening. For people who make LinkedIn content. The "face" recording is a vertical
crop of the same screen recording (a stand-in, no real face), so `face` layout shows a slice of
the app, not a person.

Sync: screen starts at -3.0 s (confidence 44.7). Checked face against screen at 40, 51, 72 and
76 s: same page, same cursor spot each time. They line up.

## Timeline

Seconds of the main recording (face).

- 0–22.3: nothing said. Start page, still.
- 22.36–27.26: "Moikka, mä voisin hei nyt ihan nopeesti demottaa tätä meidän Outerview-tuotetta." Start page.
- 27.3–30.2: pause 2.9 s.
- 30.20–35.54: "Tämä on siis tuote, joka luo sisältöä haastatteluiden perusteella." Start page.
- 35.96–42.58: "Etusivu näyttää meidän tältä, ja tästä mä voin lähteä tekemään uutta haastattelua." Start page, cursor on "Start talking with Maya".
- 42.6–49.4: nothing said. Detour: Posts page at ~44–45.6 (the speaker's own LinkedIn posts), back to Start, cursor to "Start with your own topic".
- 49.42–52.62: "Otetaan tuosta, että otetaan oma aihe," clicks "Start with your own topic"; modal opens at 51.0.
- 53.04–70.00: "haluaisin puhua tekoälyn aiheuttamasta identiteettikriisistä devaajille." Said slowly while typing it into the modal (Whisper stretches "haluaisin" to 4.9 s and "identiteettikriisistä" to 6.2 s; typing gaps inside those words). Typing done by ~70.
- 70.38–72.64: "Tekoäly ettei tarvitse kirjoittaa niin hyvää Suomea." Aside about the typo just typed. Cursor to "Talk to Maya".
- 73.04–75.32: "Lähdetään tästä haastatteluun," clicks "Talk to Maya" ~74; screen goes dark (loading) at 74.4.
- 75.3–76.7: pause 1.4 s.
- 76.68–80.46: "tsekataan, että mikrofonit ja pelit ja rensselit toimii." Quick mic check ("We hear you — you're good to go"), cursor to "Ready to start".
- 80.5–85.0: nothing said. Clicks "Ready to start"; at 84 the interview page "Maya — Listening", topic in the side panel. Recording ends before Maya speaks.

## Problems

- Opening 0–22.3: 22 s of nothing. Cut.
- Wait 42.6–49.4 (6.8 s): silent detour to Posts and back. Cut: 42.7 straight to 49.3.
- Typing 53–70: 17 s for one sentence, words stretched over typing pauses; word times can't show the gaps, so no cutting by word. Keep as one stretch, or trim by loudness: cuts.json silences at 49.6–50.3 and 54.2–54.8 (check before cutting). Finished topic text on screen ~69–74.
- Typo on screen: typed topic reads "identiteetikriisistä" (one t), visible 62–74 and in the interview side panel at 84. Not fixable in the edit; a zoom on the modal makes it more visible.
- Aside 70.38–72.64 ("Tekoäly ettei tarvitse kirjoittaa niin hyvää Suomea"): remark about the typo, off topic. Cut (73.0 follows cleanly). Whisper's wording here looks unreliable; check by ear if kept.
- Pauses 27.3–30.2 (2.9 s), 75.3–76.7 (1.4 s): end the segment and restart.
- Ending 80.5–85: no speech, no wrap-up line; Maya "Listening" at 84 is a natural last image.
- Slip: "mä voisin hei nyt ihan nopeesti" (22.36–24.42), mild stumble; keep.
- Clean voice: ElevenLabs refused (API key lacks `audio_isolation` permission); voice.wav only noise-filtered and mastered.
- On screen: Posts page (~44–45.6) shows the speaker's own drafts in full; sidebar shows "Admin", "Academy ADMIN", "Social Selling ADMIN" throughout; interview page has a "Debug" button (84). No other people's data, keys or emails. Cutting 42.6–49.4 removes the Posts page.

## Intro and outro

- Intro: 22.2–27.4 ("Moikka … Outerview-tuotetta"), plus 30.1–35.7 ("Tämä on siis tuote, joka luo sisältöä haastatteluiden perusteella"); switch to `screen` at "Etusivu" (35.9).
- Outro: no wrap-up exists. Best close: 73.0–80.6 ("Lähdetään tästä haastatteluun, tsekataan että mikrofonit … toimii"), or run to ~85 to show Maya listening.
- Face camera: a vertical crop of the screen, not a person (stand-in). Works as placeholder; recheck framing with a real face recording.

## Moments to zoom

Boxes checked with `frame agent-test screen <t> x,y,w,h`.

- 36.0–41.5, [570, 0, 1040, 585]: hero card ("Just start talking. Maya takes it from there.", "Start talking with Maya", "Start with your own topic") while he says "tästä mä voin lähteä tekemään uutta haastattelua". Checked at 38.
- 56–62 (anywhere in 53–70), [580, 386, 760, 428]: the "Start with your own topic" modal with the text being typed. Checked at 60. Under 6 s; also shows the typo.
- 77.0–80.4, [600, 240, 720, 405]: mic check card top (avatar, "Quick mic check", level meter, "We hear you — you're good to go") while he says the mics work. Checked at 78. Only if on `screen`.
- Marginal: 49.5–51.0, [560, 200, 880, 495]: "Start with your own topic" button before the click (checked at 50). Only 1.5 s; probably skip.

## For the titles

- Core idea: just talk about a topic; Outerview's interviewer Maya turns the interview into content.
- Speaker's words: "luo sisältöä haastatteluiden perusteella", "uutta haastattelua", "oma aihe", "lähdetään haastatteluun".
- Names: Outerview, Maya. On screen: "Just start talking. Maya takes it from there."

## Caption spelling

Transcript already spells Outerview right (project.yaml's replace covers the usual misses).

- Suomea: suomea
