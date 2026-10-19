# outerview-videos

Short vertical (1080×1920) product videos of Outerview, made from a script:
Playwright records the app, ElevenLabs reads the narration, Remotion zooms, adds the
cursor, clicks, spotlights, captions, title and end card, and mixes in music.

```bash
cp .env.example .env            # app URL + demo login, ElevenLabs key + voice id
npm run make -- edit-post            # → out/edit-post/en/edit-post.en.mp4
npm run make -- edit-post --lang fi  # → out/edit-post/fi/edit-post.fi.mp4
npm run studio -- edit-post --lang fi  # scrub the last build in Remotion Studio
npm run shot -- /transcripts    # screenshot a page as the demo user, before scripting it
```

The app must be running at `OUTERVIEW_URL`. Without ElevenLabs keys the video is built
silent, with placeholder timings, so a script can be worked on before spending credits.

## Caching

Narration and recordings are made once and reused, so a re-run after changing only how the
video looks (captions, cards, camera, music) goes straight to rendering.

- **Voice**: each line is cached in `cache/tts/` by its text, voice, model and neighbouring
  lines. Change a line and only that line is generated again.
- **Recording**: `out/<video>/<lang>/recording.json` and its frames are reused while the
  start page, viewport, step code, the recorder and the narration lengths are unchanged. Any
  of those changing records again by itself, so picture and voice can't drift apart.

To force it:

| Flag | Does |
|---|---|
| `--revoice` | Generate this video's narration again (a new take). The recording follows, as the lengths change. |
| `--rerecord` | Record again, keeping the narration. For when the app changed but the script didn't. |
| `--fresh` | Both. |

`rm -rf cache out` clears everything.

## A video

One file in `videos/`. Each step has a line of narration and what happens on screen while
it is said; a step lasts at least as long as its narration.

```ts
{ say: "Open the one you like.", do: (d) => d.click("text=We spent four months") }
```

The director `d` (see `Director` in `src/types.ts`) has `click`, `type`, `select` + `keys`
(edit a phrase in a text field), `highlight`, `focus`, `overview`, `hover`, `scrollTo`,
`goto`, `wait`, `cut`, and the raw Playwright `page`. Every action logs where it happened,
and Remotion moves the camera there. After a click that changes the screen, `focus` the new
thing, or the camera stays where the click was.

**Slow things** (Maya's replies, page loads): wrap the wait in `d.cut()`. It keeps
`keepMs` of it, sped up (with a "⏩ 8×" badge), or with `keepMs: 0` makes a straight cut
with a short cross-fade. Narration timing ignores the time cut out.

```ts
await d.click("button[aria-label='Send']");
await d.cut(() => d.page.getByText("Working on it…").waitFor({ state: "hidden", timeout: 150_000 }), { keepMs: 1500 });
```

**Demo data**: whatever the video changes for real is put back in `setup`, which gets
`sql` for the local app database (`OUTERVIEW_DATABASE_URL`; anything but localhost is
refused) and the demo `userId`. See `videos/edit-post.ts`.

**Interview screens**: the recording browser has a fake microphone and camera, so Maya's
mic check passes and its level meter moves.

## Voice

- **Language:** `--lang fi` picks each line's `fi` text. Lines are `"text"` or `{ en: "...", fi: "..." }`.
- **Pronunciation:** `pronounce.ts` respells words per language (`Outerview` → `Autervjuu` in
  Finnish) for the voice only; captions keep the script's spelling. Try spellings with
  `npm run say -- --lang fi "Tämä on Outerview."`.
- **Audio tags:** with `model: "eleven_v4"` (or `"eleven_v3"`) in the script, `[laughs]`,
  `[sighs]`, `[whispers]`, `[clears throat]` and the like are performed. They never show in
  captions.
- **A bad ending:** if a take ends with a stray sound, cut it by hand with the step's
  `voiceEnd: { fi: 3190 }` (ms into the clip, per language), or get a new take with `--revoice`.

## How it fits together

1. **voice** (`src/voice.ts`): each line → mp3 + word timings, cached in `cache/tts`.
2. **record** (`src/record.ts`): plays the steps in headless Chromium at 2×, capturing
   ~30fps screenshots and a timeline of camera, cursor, click and spotlight events.
3. **render** (`src/remotion/`): `out/<video>/manifest.json` is the props; `out/<video>` is the
   public dir.

Music: put a track at the path in the script (`assets/music/track.mp3`). It loops, fades,
and ducks under the voice.
