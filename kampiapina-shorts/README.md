# kampiapina-shorts

Vertical shorts (1080×1920) for Kampiapina from a 4K camera recording, with b-roll and
screen recordings cut in. Agents make the first cut in Kdenlive, you fix it there, and the
agents finish it: captions in white and Kampiapina red, a hard cut closer on the two lines that
matter, a warm faded retro look, music under the voice.

```bash
npm install
cp .env.example .env     # OPENAI_API_KEY (transcripts), ELEVENLABS_API_KEY (voice clean-up, optional)
```

Then in Claude Code, from this folder:

```
/make-short trail-tips
```

## The three phases

1. **First cut (agents).** Drop all the files in `projects/<name>/`: the talking head,
   b-roll, screen recordings, no sorting. The analyzer sorts them into `footage/` by
   looking at them (and asks if it can't tell), cleans the voice, transcribes it and looks at everything; the planner picks the hook,
   cuts out pauses, retakes and fillers, frames the speaker in the 9:16 crop, puts in
   emphasis zooms and inserts (`plan.yaml`), and makes `<name>.kdenlive` from it.
2. **You, in Kdenlive** (`npm run short -- open <name>`): fix timings and cuts, move or
   swap inserts, change zooms, and fix the captions' text and timing on the Subtitles
   track. Kdenlive shows them plainly; the render draws them in the short's style. No grade
   there.

   | Track | What |
   |---|---|
   | B-roll / screen | inserts over the camera |
   | Backdrop | a blurred, dimmed fill behind a screen recording shown whole |
   | Camera | the camera's pieces; each has a **Transform** effect with the framing and the emphasis zooms as keyframes |
   | Insert sound | an insert's own audio, when the plan gives it `sound` |
   | Voice | the cleaned voice, grouped with its camera piece |

   Guides mark each piece and why it's there. Zooms are the Transform keyframes: move
   them, change them, add your own; any easing works. Save when you're done.
3. **Finish (agents).** Say it's done: the finisher renders `out.mp4` with the captions as
   you left them on the Subtitles track (`<name>.kdenlive.ass`). No review: you've already
   reviewed the cut in Kdenlive (ask for one if you want it).

Everything is read from the `.kdenlive` file when rendering: every clip of every track,
its Transform (keyframes, easing), Gaussian blur and Brightness, speed changes, and on
sound its fades and Volume. Other effects, titles and transitions made in Kdenlive aren't
rendered (the render says which).

## The look

- **Captions**: a few big white words at a time, low in the middle; the word being said on
  a block of Kampiapina red, `#911B1B` (`src/remotion/theme.ts`, `src/remotion/Captions.tsx`).
- **Emphasis zooms**: two at most, on the strongest lines: a hard cut to closer
  (×1.15–1.3), held while the phrase is said, and a hard cut back. The face sits high,
  its eyes about a third down, so the captions below don't cover it. A 4K landscape camera cropped to
  9:16 is shown at 0.89× its pixels, so a ×1.15 zoom is still sharp; a 4K vertical one
  has room for ×2.
- **Grade**: colours a little washed out, a warm cast, blacks lifted to warm brown,
  highlights held back, a soft vignette and fine grain (`src/remotion/Grade.tsx`).
  `grade` in `project.yaml` sets how much: 0 off, 1 full (still slight). `bright` lifts the
  midtones: 0 off, 0.5 the default, 1 much brighter.
- **Music**: `music: assets/music/<track>.mp3` in `project.yaml`, ducked under speech.

## Releasing

`npm run release -- <name>` publishes the short to **YouTube Shorts** and **Instagram Reels**
and sends it to your **TikTok** inbox as a draft: you finish it in the app (a sound, the
caption, which is printed for you to paste) and post it there.

- The first run makes `release.yaml` in the project: the title, the caption, hashtags,
  YouTube's privacy and category or a time to publish. Fill it in, then run again.
- `--dry` shows what would be sent; `youtube`, `instagram`, `tiktok` after the name picks
  platforms. What's been released is in `released.json`, and a platform isn't posted to
  twice (`--again` does).
- Once per platform: `npm run release -- login youtube|instagram|tiktok`. Keys are in
  `.env` (see `.env.example`), tokens in `~/.config/kampiapina-shorts/tokens.json`.
- Instagram takes either token the Meta dashboard gives. A Facebook Login one (`EAA…`, e.g. a
  system user's from Business Settings) is for an account linked to a Facebook Page: the
  file is uploaded straight. An Instagram Login one (`IGAA…`) has Instagram fetch the video
  from a public address: the script serves it from this machine for a minute through a
  Cloudflare quick tunnel, so that way needs `cloudflared` installed.
- Approvals: YouTube may keep an unaudited API project's uploads private (ours came out
  public; if one doesn't, the script says so: make it public in Studio). TikTok's drafts
  need no audit. Instagram needs a Creator or Business account.

### Instagram's token

How the one in use was made: a system user's token, which never runs out (Meta's menus move;
these were the names in November 2026).

1. **The app.** developers.facebook.com → My Apps → Create app, the use case "Manage
   messaging & content on Instagram". Its dashboard offered only "API setup with Facebook
   login" and "Unified login", no Instagram login: so the token is a Facebook Login one
   (`EAA…`), and the Instagram account has to be reached through a Facebook Page.
2. **Instagram linked to the Page.** In the Instagram app: Edit profile → Page → Connect
   existing Page (or from the Page's Settings → Linked accounts, or Business Suite →
   Settings → Instagram accounts). Business Settings → Accounts → Instagram accounts then
   shows the Page among the account's connected assets.
3. **The app in the business portfolio.** business.facebook.com/settings → Accounts → Apps →
   Add → Connect an app ID (the App ID from the app's dashboard).
4. **A system user with the assets.** Users → System users → the system user → Assign
   assets: the **app** (full control: without it, "Generate new token" says "No permissions
   available"), the **Page** (full control) and the **Instagram account** (full control).
5. **The token.** On the system user: Generate new token → the app → expiration **Never** →
   all the permissions offered (at least `instagram_basic`, `instagram_content_publish`,
   `pages_show_list`, `pages_read_engagement`; without `instagram_basic` the Page doesn't
   show its Instagram account) → copy it (it's shown once).
6. **Into the script.** `INSTAGRAM_ACCESS_TOKEN=<token>` in `.env`, then
   `npm run release -- login instagram`: it finds the Page, its Instagram account
   (@kampiapina), and keeps the token in `~/.config/kampiapina-shorts/tokens.json`. No
   `META_APP_ID`/`META_APP_SECRET` or `cloudflared` needed this way.

A new token (lost, or revoked) is steps 5–6 again.

### TikTok's app

The video goes to the TikTok inbox as a draft, so the app runs in a **sandbox**: no review
by TikTok, for up to 10 of your own accounts (a sandbox can't post public videos straight
from the API, which isn't done here).

1. **The app.** developers.tiktok.com → Manage apps → Connect an app: name, icon, category,
   description.
2. **The sandbox.** The toggle next to the app's name → Sandbox → Create Sandbox. All the
   rest is done in it: it has its own settings and keys (its Client key starts `sb`).
3. **Its settings.** Platforms: **Desktop**. Products: **Login Kit** and **Content Posting
   API** (Direct Post off; no domain to verify, the file itself is uploaded). Login Kit →
   Desktop → Redirect URI: `http://localhost:8765/callback/`, exactly (another one: put it
   in `.env` as `TIKTOK_REDIRECT_URI`). Scopes: `user.info.basic` (with Login Kit) and
   `video.upload` (with the Content Posting API: it's there only once that's added).
4. **Apply changes.** Nothing above counts until then: TikTok's sign-in checks the saved
   settings, and says "redirect_uri" or "scope" when what the script asks for isn't in them.
5. **The account.** Sandbox settings → Target users → Add account: the Kampiapina TikTok
   account (it can take up to an hour to be active).
6. **Into the script.** The sandbox's Client key and Client secret in `.env`
   (`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`), then `npm run release -- login tiktok` in a
   terminal: it opens the sign-in in the browser and waits for it to come back. The sign-in
   lasts up to 180 days; when it runs out, the script says so: log in again.

Then `npm run release -- <name> tiktok` uploads it and prints the caption; in TikTok, the
inbox notification opens the draft: paste the caption, add a sound if you like, post.

### YouTube's client

1. **The project.** console.cloud.google.com → the project picker → New project. In it,
   APIs & Services → Library → **YouTube Data API v3** → Enable (in the project the client
   below is in: otherwise the sign-in ends with "YouTube Data API v3 has not been used in
   project …").
2. **The consent screen.** Google Auth Platform → Get started: a name, your email, audience
   External. Audience → **Publish app** (In production: in Testing the sign-in runs out after
   7 days). Signing in then shows "Google hasn't verified this app": Advanced → Go to ….
3. **The client.** Clients → Create client → **Desktop app**. Its Client ID and secret in
   `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
4. **Into the script.** `npm run release -- login youtube` in a terminal: sign in in the
   browser, choosing the Kampiapina channel if asked.

Each upload costs 1,600 of the project's 10,000 daily API units: about six a day.

## By hand

The agents' work is these commands (`npm run short -- <command> <name>`); the file
formats and editing rules are in `.claude/skills/make-short/reference.md`.

| Command | Does |
|---|---|
| `init` | the project's folders and `project.yaml` |
| `analyze` | clean voice, transcript, silences, a first guess at the cut, contact sheets |
| `check` | the plan's problems |
| `kdenlive [--force]` | `<name>.kdenlive` from `plan.yaml` (won't replace your edits without `--force`) |
| `open` | opens it in Kdenlive |
| `frame <what> <s>` | a frame of the camera, an insert, the Kdenlive cut (as Kdenlive draws it), or the video |
| `level <from> <to>` | the voice's loudness, to cut in the quiet |
| `proxy` | proxies on in the Kdenlive project, made for its footage (`kdenlive` does it too); the render uses the originals |
| `captions [--force]` | the captions made again from the cut, on Kdenlive's Subtitles track (`<name>.kdenlive.ass`) |
| `render [--sample <from> <to>]` | `out.mp4` (or `sample.mp4`) |
| `review` | checks of the video: heard against captions, sound, frames |

Costs: Whisper $0.006 a minute (the recording once, each cut once); ElevenLabs voice
isolation 1,000 credits a minute, once per recording. Needs Kdenlive (25 or newer; the
flatpak works) and a full ffmpeg (the system's, or the Kdenlive flatpak's).
