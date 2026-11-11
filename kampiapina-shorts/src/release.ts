// A finished short out to the world: YouTube Shorts and Instagram Reels published, TikTok as
// a draft in the app's inbox (finished and posted there, with a sound if you like).
//   npm run release -- login <youtube|instagram|tiktok>    once each: the account it posts as
//   npm run release -- <name> [youtube] [instagram] [tiktok] [--dry] [--again]
// What goes with the video (title, caption, tags) is the project's release.yaml, made the
// first time. What's been released is kept in released.json: a platform isn't posted to
// twice unless --again. Keys are in .env (see .env.example), tokens in
// ~/.config/kampiapina-shorts/tokens.json.
import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { chmod, mkdir, open, readFile, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { probe } from "./lib/media.ts";
import { paths, readYaml, type Settings } from "./project.ts";

const PLATFORMS = ["youtube", "instagram", "tiktok"] as const;
type Platform = (typeof PLATFORMS)[number];

/** The local page the sign-ins come back to (register it with TikTok as is). */
// TIKTOK_REDIRECT_URI in .env: another address, exactly as registered at TikTok (its port is listened on).
const TIKTOK_REDIRECT = process.env.TIKTOK_REDIRECT_URI || "http://localhost:8765/callback/";
const PORT = Number(new URL(TIKTOK_REDIRECT).port) || 8765;
const GOOGLE_REDIRECT = `http://127.0.0.1:${PORT}/callback/`;
const IG = "https://graph.instagram.com/v27.0";
/** Instagram through Facebook Login (a token starting EAA…): the account linked to a Facebook Page. */
const FB = "https://graph.facebook.com/v27.0";

type Release = {
  title?: string;
  caption?: string;
  tags?: string[];
  /** The video, if not the project's out.mp4 (or <name>.mp4). */
  file?: string;
  youtube?: { privacy?: "public" | "unlisted" | "private"; category?: number | string; publishAt?: string; title?: string; description?: string };
  instagram?: { caption?: string; shareToFeed?: boolean; thumbOffset?: number };
  tiktok?: { caption?: string };
};
type Released = Partial<Record<Platform, { id: string; url?: string; at: string; file: string; note?: string }>>;

type Tokens = {
  youtube?: { refreshToken: string; accessToken?: string; expiresAt?: number; channel?: string };
  instagram?: {
    /** Which API the token is for: Instagram Login (IGAA…, renewable) or Facebook Login (EAA…). */
    via?: "instagram" | "facebook";
    accessToken: string;
    userId: string;
    username: string;
    refreshedAt: number;
    /** When a Facebook token runs out; none when it doesn't. */
    expiresAt?: number;
  };
  tiktok?: { accessToken: string; expiresAt: number; refreshToken: string; refreshExpiresAt: number; openId: string; name?: string };
};

const log = (s: string) => console.log(s);
const rel = (f: string) => path.relative(process.cwd(), f);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const words = args.filter((a) => !a.startsWith("--"));

function usage(): never {
  console.error("Usage: npm run release -- <name> [youtube] [instagram] [tiktok] [--dry] [--again]\n       npm run release -- login <youtube|instagram|tiktok>");
  process.exit(2);
}

// --- release ---------------------------------------------------------------------------

async function release(name: string, platforms: Platform[]) {
  const p = paths(name);
  if (!existsSync(p.dir)) throw new Error(`No project ${rel(p.dir)}`);
  const meta = path.join(p.dir, "release.yaml");
  if (!existsSync(meta)) {
    await writeFile(meta, template(name));
    log(`${rel(meta)}: made. Write the title and caption in it, then run this again.`);
    return;
  }
  const r = (await readYaml<Release>(meta)) ?? {};
  const settings = existsSync(p.settings) ? ((await readYaml<Settings>(p.settings)) ?? {}) : {};
  const file = r.file ? path.resolve(p.dir, r.file) : [p.out, path.join(p.dir, `${name}.mp4`)].find((f) => existsSync(f));
  if (!file || !existsSync(file)) throw new Error(`No video: render it first (npm run short -- render ${name}), or give file: in ${rel(meta)}`);

  const title = (r.youtube?.title ?? r.title ?? "").trim();
  const caption = (r.caption ?? "").trim();
  const tags = (r.tags ?? []).map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
  const hashtags = tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ");
  const withTags = (text: string) => [text, hashtags].filter(Boolean).join("\n\n");

  // The video against what the platforms take.
  const v = probe(file);
  const size = (await stat(file)).size;
  const problems: string[] = [];
  if (v.height <= v.width) problems.push(`it's ${v.width}×${v.height}: shorts are vertical (9:16)`);
  if (platforms.includes("youtube") && v.durationMs > 180_000) problems.push(`it's ${Math.round(v.durationMs / 1000)} s: YouTube counts it a Short only up to 3 min`);
  if (platforms.includes("instagram") && v.durationMs > 15 * 60_000) problems.push("Instagram Reels are 15 min at most");
  if (platforms.includes("youtube") && !title) problems.push(`no title in ${rel(meta)} (YouTube needs one)`);
  if (title.length > 100) problems.push(`the title is ${title.length} characters: YouTube takes 100`);
  if (/[<>]/.test(title + caption)) problems.push("YouTube doesn't take < or > in the title or description");
  if (caption.length > 2200) problems.push(`the caption is ${caption.length} characters: Instagram and TikTok take 2,200`);
  if (tags.length > 30) problems.push("Instagram takes 30 hashtags at most");
  if (problems.length) throw new Error(`Not released:\n${problems.map((x) => `  - ${x}`).join("\n")}`);

  const recordFile = path.join(p.dir, "released.json");
  const record: Released = existsSync(recordFile) ? JSON.parse(await readFile(recordFile, "utf8")) : {};
  log(`${rel(file)}: ${v.width}×${v.height}, ${(v.durationMs / 1000).toFixed(1)} s, ${(size / 1e6).toFixed(1)} MB`);

  const failed: string[] = [];
  for (const platform of platforms) {
    const done = record[platform];
    if (done && !flags.has("--again")) {
      log(`\n${platform}: released ${done.at.slice(0, 16).replace("T", " ")}${done.url ? `: ${done.url}` : ""} (--again posts it again)`);
      continue;
    }
    log(`\n${platform}:`);
    try {
      let got: { id: string; url?: string; note?: string };
      if (platform === "youtube") {
        const y = r.youtube ?? {};
        const publishAt = y.publishAt ? new Date(y.publishAt).toISOString() : undefined;
        const body = {
          snippet: {
            title,
            description: withTags((y.description ?? caption).trim()),
            tags,
            categoryId: String(y.category ?? 17),
            ...(settings.language ? { defaultLanguage: settings.language, defaultAudioLanguage: settings.language } : {}),
          },
          // A scheduled video is private until its time.
          status: { privacyStatus: publishAt ? "private" : (y.privacy ?? "public"), selfDeclaredMadeForKids: false, ...(publishAt ? { publishAt } : {}) },
        };
        if (flags.has("--dry")) { log(JSON.stringify(body, null, 2)); continue; }
        got = await youtubeUpload(file, size, body);
      } else if (platform === "instagram") {
        const ig = r.instagram ?? {};
        const body = {
          media_type: "REELS",
          caption: withTags((ig.caption ?? caption).trim()),
          share_to_feed: ig.shareToFeed ?? true,
          ...(ig.thumbOffset !== undefined ? { thumb_offset: ig.thumbOffset } : {}),
        };
        if (flags.has("--dry")) { log(JSON.stringify(body, null, 2)); continue; }
        got = await instagramPublish(file, size, body);
      } else {
        const text = withTags((r.tiktok?.caption ?? caption).trim());
        if (flags.has("--dry")) { log(`a draft to the TikTok inbox; the caption to paste there:\n${text}`); continue; }
        got = await tiktokDraft(file, size);
        log(`  open TikTok: the notification in your inbox has the draft. The caption to paste:\n\n${text}\n`);
      }
      record[platform] = { ...got, at: new Date().toISOString(), file: rel(file) };
      await writeFile(recordFile, `${JSON.stringify(record, null, 2)}\n`);
      log(`  ${got.url ?? got.id}${got.note ? ` (${got.note})` : ""}`);
    } catch (e) {
      failed.push(platform);
      log(`  FAILED: ${(e as Error).message}`);
    }
  }
  if (failed.length) {
    log(`\nNot released to ${failed.join(", ")}: run again to try those (the others are kept in ${rel(recordFile)})`);
    process.exit(1);
  }
}

function template(name: string) {
  return `# ${name}: what goes with the short when it's released (npm run release -- ${name})
title: ""                # YouTube's title, 100 characters at most
caption: ""              # Instagram's caption and YouTube's description; for TikTok it's printed, to paste in the app
                         # several lines: caption: | and the lines under it, two spaces in
tags: []                 # e.g. [pyöräily, kampiapina]: hashtags at the end of the caption, and YouTube's tags
youtube:
  privacy: public        # public | unlisted | private
  category: 17           # 17 Sports, 22 People & Blogs, 2 Autos & Vehicles, 19 Travel & Events
  # publishAt: 2026-11-10T17:00:00+02:00   # scheduled: uploaded private, public at that time
  # title: / description:                  # instead of title / caption, for YouTube only
instagram:
  shareToFeed: true      # shown in the feed too, not only under Reels
  # thumbOffset: 1500    # the cover: the frame at this ms
  # caption:             # instead of caption, for Instagram only
# tiktok:
#   caption:             # instead of caption, for TikTok only
`;
}

// --- tokens and sign-in ----------------------------------------------------------------

const TOKENS = path.join(os.homedir(), ".config", "kampiapina-shorts", "tokens.json");

async function loadTokens(): Promise<Tokens> {
  return existsSync(TOKENS) ? JSON.parse(await readFile(TOKENS, "utf8")) : {};
}

async function saveTokens(change: (t: Tokens) => void) {
  const t = await loadTokens();
  change(t);
  await mkdir(path.dirname(TOKENS), { recursive: true });
  await writeFile(TOKENS, JSON.stringify(t, null, 2), { mode: 0o600 });
  await chmod(TOKENS, 0o600);
}

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`No ${key} in .env (see .env.example)`);
  return v;
}

/** A sign-in in the browser, its code back to the local page. */
async function signIn(url: string): Promise<URLSearchParams> {
  const state = new URL(url).searchParams.get("state");
  const servers: http.Server[] = [];
  try {
    const got = new Promise<URLSearchParams>((resolve, reject) => {
      const handle: http.RequestListener = (req, res) => {
        const q = new URL(req.url ?? "/", `http://localhost:${PORT}`).searchParams;
        if (!q.has("code") && !q.has("error")) return void res.writeHead(404).end();
        const ok = q.has("code") && q.get("state") === state;
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end(ok ? "Signed in: back to the terminal." : `Not signed in: ${q.get("error_description") ?? q.get("error") ?? "the state didn't match"}`);
        ok ? resolve(q) : reject(new Error(`Not signed in: ${q.get("error_description") ?? q.get("error") ?? "the state didn't match"}`));
      };
      // localhost may be either of these to the browser.
      for (const host of ["127.0.0.1", "::1"]) {
        const s = http.createServer(handle);
        s.on("error", (e: NodeJS.ErrnoException) => (host === "::1" ? undefined : reject(e)));
        s.listen(PORT, host);
        servers.push(s);
      }
    });
    log(`Sign in in the browser (if it doesn't open, open this):\n${url}\n`);
    spawn("xdg-open", [url], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
    return await got;
  } finally {
    for (const s of servers) s.close();
  }
}

/** JSON from an API, its error in full when it fails. */
async function api<T = any>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { text };
  }
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${url.split("?")[0]}: ${res.status} ${text.slice(0, 800)}`);
  return body as T;
}

const form = (o: Record<string, string>) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() });

// --- YouTube ---------------------------------------------------------------------------

async function loginYoutube() {
  const verifier = randomBytes(48).toString("base64url");
  const q = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"),
    redirect_uri: GOOGLE_REDIRECT,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
    access_type: "offline",
    prompt: "consent",
    state: randomBytes(16).toString("hex"),
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  const code = (await signIn(`https://accounts.google.com/o/oauth2/v2/auth?${q}`)).get("code")!;
  const t = await api("https://oauth2.googleapis.com/token", form({
    code, client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), redirect_uri: GOOGLE_REDIRECT, grant_type: "authorization_code", code_verifier: verifier,
  }));
  if (!t.refresh_token) throw new Error("Google gave no refresh token: remove the app's access at myaccount.google.com/permissions and sign in again");
  const ch = await api("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { authorization: `Bearer ${t.access_token}` } });
  const channel = ch.items?.[0]?.snippet?.title;
  if (!channel) throw new Error("That Google account has no YouTube channel");
  await saveTokens((x) => (x.youtube = { refreshToken: t.refresh_token, accessToken: t.access_token, expiresAt: Date.now() + t.expires_in * 1000, channel }));
  log(`YouTube: signed in as the channel ${channel}`);
}

async function youtubeToken(): Promise<string> {
  const y = (await loadTokens()).youtube;
  if (!y) throw new Error("Not signed in: npm run release -- login youtube");
  if (y.accessToken && (y.expiresAt ?? 0) > Date.now() + 60_000) return y.accessToken;
  const t = await api("https://oauth2.googleapis.com/token", form({
    refresh_token: y.refreshToken, client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), grant_type: "refresh_token",
  })).catch((e: Error) => {
    if (/invalid_grant/.test(e.message)) throw new Error("The YouTube sign-in has run out (an app in Testing loses it after 7 days: put it In production): npm run release -- login youtube");
    throw e;
  });
  await saveTokens((x) => (x.youtube = { ...y, accessToken: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 }));
  return t.access_token;
}

async function youtubeUpload(file: string, size: number, body: { status: { privacyStatus: string; publishAt?: string } }) {
  const token = await youtubeToken();
  log(`  uploading (${(size / 1e6).toFixed(1)} MB)…`);
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8", "x-upload-content-length": String(size), "x-upload-content-type": "video/mp4" },
    body: JSON.stringify(body),
  });
  const where = init.headers.get("location");
  if (!init.ok || !where) throw new Error(`YouTube didn't start the upload: ${init.status} ${(await init.text()).slice(0, 800)}`);
  const video = await api(where, { method: "PUT", headers: { "content-type": "video/mp4", "content-length": String(size) }, body: await readFile(file) });
  const [asked, got] = [body.status.privacyStatus, video.status?.privacyStatus as string | undefined];
  return {
    id: video.id as string,
    url: `https://youtube.com/shorts/${video.id}`,
    note: got === "private" && asked !== "private"
      ? "uploaded PRIVATE: YouTube keeps uploads of an unaudited API project private; make it public in YouTube Studio"
      : body.status.publishAt ? `private until ${body.status.publishAt}` : got,
  };
}

// --- Instagram -------------------------------------------------------------------------

async function loginInstagram() {
  let token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    log("The token from the Meta app dashboard: Instagram → API setup with Instagram login → Generate access tokens → your account → Generate token.");
    if (!process.stdin.isTTY) throw new Error("Nothing to type it in here: put INSTAGRAM_ACCESS_TOKEN=<token> in .env and run this again");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    token = (await rl.question("Access token: ")).trim();
    rl.close();
  }
  if (!token) throw new Error("No token");
  if (token.startsWith("EAA")) return loginInstagramViaFacebook(token);
  const me = await api(`${IG}/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`);
  await saveTokens((x) => (x.instagram = { via: "instagram", accessToken: token, userId: me.user_id ?? me.id, username: me.username, refreshedAt: Date.now() }));
  log(`Instagram: signed in as @${me.username} (the token lasts 60 days, and is renewed each time it's used)`);
}

/**
 * A Facebook Login token: made long-lived with the app's secret, then the Page's token, which
 * doesn't run out, for the Instagram account linked to the Page.
 */
async function loginInstagramViaFacebook(token: string) {
  const enc = encodeURIComponent;
  let user = token;
  let expiresAt: number | undefined;
  const [id, secret] = [process.env.META_APP_ID, process.env.META_APP_SECRET];
  const me = await api(`${FB}/me?fields=name&access_token=${enc(token)}`);
  // A system user's token (Business Settings) is used as it is: made to never run out.
  const info = await api(`${FB}/debug_token?input_token=${enc(token)}&access_token=${enc(token)}`).catch(() => undefined);
  const system = info?.data?.type === "SYSTEM_USER" || /system user/i.test(me.name ?? "");
  if (!system && id && secret) {
    const t = await api(`${FB}/oauth/access_token?grant_type=fb_exchange_token&client_id=${enc(id)}&client_secret=${enc(secret)}&fb_exchange_token=${enc(token)}`);
    user = t.access_token;
    expiresAt = t.expires_in ? Date.now() + t.expires_in * 1000 : undefined;
  } else if (!system) log("No META_APP_ID and META_APP_SECRET in .env: the token can't be made long-lived, and may run out in an hour or two.");
  const pages = await api(`${FB}/me/accounts?fields=name,access_token,instagram_business_account{id,username}&limit=100&access_token=${enc(user)}`);
  const linked = (pages.data ?? []).filter((pg: any) => pg.instagram_business_account);
  if (!linked.length)
    throw new Error(`No Facebook Page with an Instagram account linked to it among the ${pages.data?.length ?? 0} Pages this token sees. ` +
      "Link the Instagram account to a Page (Instagram: Settings → Accounts Center), " +
      (system ? `assign the Page and the Instagram account to the system user ${me.name} (Business Settings → System users → Assign assets), then generate its token again` : "then generate the token again, choosing the Page when asked") +
      ", with instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement and business_management.");
  const want = process.env.INSTAGRAM_USERNAME?.replace(/^@/, "");
  const pg = linked.find((x: any) => !want || x.instagram_business_account.username === want);
  if (!pg) throw new Error(`No linked account @${want}: ${linked.map((x: any) => `@${x.instagram_business_account.username}`).join(", ")}`);
  if (linked.length > 1 && !want) log(`Several accounts: using @${pg.instagram_business_account.username} (INSTAGRAM_USERNAME in .env picks another)`);
  const ig = pg.instagram_business_account;
  // The Page's token, got with a long-lived user token, doesn't run out: use it if it can see the account.
  let use = user;
  if (expiresAt && pg.access_token) {
    const ok = await api(`${FB}/${ig.id}?fields=username&access_token=${enc(pg.access_token)}`).then(() => true, () => false);
    if (ok) [use, expiresAt] = [pg.access_token, undefined];
  }
  await saveTokens((x) => (x.instagram = { via: "facebook", accessToken: use, userId: ig.id, username: ig.username, refreshedAt: Date.now(), expiresAt }));
  log(`Instagram: signed in as @${ig.username} (through the Facebook Page ${pg.name}; ${expiresAt ? `the token runs out ${new Date(expiresAt).toISOString().slice(0, 10)}` : system ? "a system user's token: it lasts as long as you made it to" : "the token doesn't run out"})`);
}

async function instagramToken() {
  const ig = (await loadTokens()).instagram;
  if (!ig) throw new Error("Not signed in: npm run release -- login instagram");
  if (ig.via === "facebook") {
    if (ig.expiresAt && ig.expiresAt < Date.now() + 60_000) throw new Error("The Instagram (Facebook) token has run out: generate a new one, then npm run release -- login instagram");
    return ig;
  }
  // A token can be renewed once it's a day old, for 60 days from then.
  if (Date.now() - ig.refreshedAt > 24 * 3600_000) {
    try {
      const t = await api(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(ig.accessToken)}`);
      await saveTokens((x) => (x.instagram = { ...ig, accessToken: t.access_token, refreshedAt: Date.now() }));
      return { ...ig, accessToken: t.access_token as string };
    } catch (e) {
      throw new Error(`The Instagram token couldn't be renewed (over 60 days old?): npm run release -- login instagram\n${(e as Error).message}`);
    }
  }
  return ig;
}

async function instagramPublish(file: string, size: number, body: Record<string, unknown>) {
  const ig = await instagramToken();
  if (ig.via === "facebook") return instagramUpload(ig, file, size, body);
  const auth = { authorization: `Bearer ${ig.accessToken}`, "content-type": "application/json" };
  // Instagram fetches the video from a public address: this machine's, for a while, through a
  // Cloudflare quick tunnel.
  const share = await shareFile(file, size);
  try {
    log(`  Instagram is fetching it from ${share.url}…`);
    const container = await api(`${IG}/${ig.userId}/media`, { method: "POST", headers: auth, body: JSON.stringify({ ...body, video_url: share.url }) });
    const started = Date.now();
    for (;;) {
      await sleep(15_000);
      const s = await api(`${IG}/${container.id}?fields=status_code,status`, { headers: auth });
      if (s.status_code === "FINISHED") break;
      if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Instagram couldn't take the video: ${s.status ?? s.status_code}`);
      if (Date.now() - started > 10 * 60_000) throw new Error(`Instagram is still processing after 10 min (container ${container.id})`);
      log(`  processing… (${share.served() ? "fetched" : "not fetched yet"})`);
    }
    const media = await api(`${IG}/${ig.userId}/media_publish`, { method: "POST", headers: auth, body: JSON.stringify({ creation_id: container.id }) });
    const info = await api(`${IG}/${media.id}?fields=permalink`, { headers: auth }).catch(() => ({}));
    return { id: media.id as string, url: (info as any).permalink as string | undefined, note: `@${ig.username}` };
  } finally {
    share.stop();
  }
}

/** The file served from here at a random https address, until stopped. */
async function shareFile(file: string, size: number) {
  if (spawnSync("cloudflared", ["--version"], { stdio: "ignore" }).status !== 0)
    throw new Error("Needs cloudflared, for Instagram to fetch the video from this machine: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/");
  const secret = `/${randomBytes(18).toString("hex")}.mp4`;
  let served = false;
  const server = http.createServer((req, res) => {
    if (req.url !== secret) return void res.writeHead(404).end();
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
    let [from, to] = [0, size - 1];
    if (range) [from, to] = [range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2])), range[2] && range[1] ? Math.min(size - 1, Number(range[2])) : size - 1];
    if (from > to) return void res.writeHead(416, { "content-range": `bytes */${size}` }).end();
    const head = { "content-type": "video/mp4", "accept-ranges": "bytes", "content-length": String(to - from + 1) };
    if (range) res.writeHead(206, { ...head, "content-range": `bytes ${from}-${to}/${size}` });
    else res.writeHead(200, head);
    if (req.method === "HEAD") return void res.end();
    served = true;
    createReadStream(file, { start: from, end: to }).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const tunnel: ChildProcess = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`], { stdio: ["ignore", "ignore", "pipe"] });
  const stop = () => {
    tunnel.kill();
    server.close();
    server.closeAllConnections();
  };
  process.on("exit", () => tunnel.kill());
  try {
    const base = await new Promise<string>((resolve, reject) => {
      let out = "";
      tunnel.stderr!.on("data", (d: Buffer) => {
        out += d;
        const m = /https:\/\/[\w-]+\.trycloudflare\.com/.exec(out);
        if (m) resolve(m[0]);
      });
      tunnel.on("exit", (c) => reject(new Error(`cloudflared stopped (${c}): ${out.slice(-500)}`)));
      setTimeout(() => reject(new Error(`No tunnel from cloudflared in 30 s: ${out.slice(-500)}`)), 30_000);
    });
    const url = base + secret;
    // Its address takes a moment to be found from outside.
    for (let i = 0; ; i++) {
      const ok = await fetch(url, { method: "HEAD" }).then((r) => r.ok, () => false);
      if (ok) break;
      if (i > 30) throw new Error(`The tunnel ${base} doesn't answer`);
      await sleep(2000);
    }
    return { url, stop, served: () => served };
  } catch (e) {
    stop();
    throw e;
  }
}

// --- TikTok ----------------------------------------------------------------------------

async function loginTiktok() {
  const verifier = randomBytes(48).toString("base64url");
  const q = new URLSearchParams({
    client_key: env("TIKTOK_CLIENT_KEY"),
    // TIKTOK_SCOPES in .env: other scopes, to find which one TikTok refuses.
    scope: process.env.TIKTOK_SCOPES || "user.info.basic,video.upload",
    response_type: "code",
    redirect_uri: TIKTOK_REDIRECT,
    state: randomBytes(16).toString("hex"),
    // TikTok's desktop sign-in wants the challenge in hex, not base64url.
    code_challenge: createHash("sha256").update(verifier).digest("hex"),
    code_challenge_method: "S256",
  });
  log(`scopes: ${q.get("scope")}`);
  log(`redirect URI: ${TIKTOK_REDIRECT} (registered exactly so under Login Kit → Desktop, where the client key is from: Sandbox or Production)`);
  // The scopes with a plain comma, as in TikTok's own examples.
  const code = (await signIn(`https://www.tiktok.com/v2/auth/authorize/?${q.toString().replace(/%2C/g, ",")}`)).get("code")!;
  const t = await tiktokTokenCall({ code, grant_type: "authorization_code", redirect_uri: TIKTOK_REDIRECT, code_verifier: verifier });
  const me = await api(`https://open.tiktokapis.com/v2/user/info/?fields=display_name`, { headers: { authorization: `Bearer ${t.access_token}` } }).catch(() => undefined);
  const name = me?.data?.user?.display_name as string | undefined;
  await saveTokens((x) => (x.tiktok = tiktokTokens(t, name)));
  log(`TikTok: signed in${name ? ` as ${name}` : ""}`);
}

async function tiktokTokenCall(o: Record<string, string>) {
  const t = await api("https://open.tiktokapis.com/v2/oauth/token/", form({ client_key: env("TIKTOK_CLIENT_KEY"), client_secret: env("TIKTOK_CLIENT_SECRET"), ...o }));
  if (!t.access_token) throw new Error(`TikTok: ${t.error_description ?? t.error ?? JSON.stringify(t)}`);
  return t;
}

const tiktokTokens = (t: any, name?: string): NonNullable<Tokens["tiktok"]> => ({
  accessToken: t.access_token, expiresAt: Date.now() + t.expires_in * 1000, refreshToken: t.refresh_token, refreshExpiresAt: Date.now() + t.refresh_expires_in * 1000, openId: t.open_id, name,
});

async function tiktokToken() {
  const tt = (await loadTokens()).tiktok;
  if (!tt) throw new Error("Not signed in: npm run release -- login tiktok");
  if (tt.expiresAt > Date.now() + 60_000) return tt.accessToken;
  if (tt.refreshExpiresAt < Date.now()) throw new Error("The TikTok sign-in has run out: npm run release -- login tiktok");
  const t = await tiktokTokenCall({ grant_type: "refresh_token", refresh_token: tt.refreshToken });
  await saveTokens((x) => (x.tiktok = tiktokTokens(t, tt.name)));
  return t.access_token as string;
}

/** TikTok's answers: the error is in the body, "ok" when there's none. */
async function tiktok(pathname: string, token: string, body: object) {
  const r = await api(`https://open.tiktokapis.com${pathname}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" }, body: JSON.stringify(body) });
  if (r.error?.code && r.error.code !== "ok") throw new Error(`TikTok ${pathname}: ${r.error.code}: ${r.error.message}`);
  return r.data;
}

async function tiktokDraft(file: string, size: number) {
  const token = await tiktokToken();
  // Up to 64 MB in one piece; above that, 32 MB pieces, the last taking the rest.
  const MB = 1024 * 1024;
  const chunk = size <= 64 * MB ? size : 32 * MB;
  const count = Math.floor(size / chunk);
  const init = await tiktok("/v2/post/publish/inbox/video/init/", token, { source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunk, total_chunk_count: count } });
  log(`  uploading (${(size / 1e6).toFixed(1)} MB${count > 1 ? `, ${count} pieces` : ""})…`);
  const fh = await open(file);
  try {
    for (let i = 0; i < count; i++) {
      const from = i * chunk;
      const to = i === count - 1 ? size - 1 : from + chunk - 1;
      const buf = Buffer.alloc(to - from + 1);
      await fh.read(buf, 0, buf.length, from);
      const res = await fetch(init.upload_url, { method: "PUT", headers: { "content-type": "video/mp4", "content-length": String(buf.length), "content-range": `bytes ${from}-${to}/${size}` }, body: buf });
      if (!res.ok) throw new Error(`TikTok upload, piece ${i + 1}/${count}: ${res.status} ${(await res.text()).slice(0, 500)}`);
    }
  } finally {
    await fh.close();
  }
  const started = Date.now();
  for (;;) {
    await sleep(5000);
    const s = await tiktok("/v2/post/publish/status/fetch/", token, { publish_id: init.publish_id });
    if (s.status === "SEND_TO_USER_INBOX" || s.status === "PUBLISH_COMPLETE") break;
    if (s.status === "FAILED") throw new Error(`TikTok couldn't take the video: ${s.fail_reason}`);
    if (Date.now() - started > 5 * 60_000) throw new Error(`TikTok is still processing after 5 min (${init.publish_id})`);
  }
  return { id: init.publish_id as string, note: "a draft in the TikTok inbox" };
}

/** Through Facebook Login: the file uploaded straight to Instagram, then published. */
async function instagramUpload(ig: NonNullable<Tokens["instagram"]>, file: string, size: number, body: Record<string, unknown>) {
  const auth = { authorization: `OAuth ${ig.accessToken}` };
  const container = await api(`${FB}/${ig.userId}/media?upload_type=resumable`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify(body) });
  log(`  uploading (${(size / 1e6).toFixed(1)} MB)…`);
  // The upload can answer with an error (400 ProcessingFailedError) although the video got there
  // and the container goes on to FINISHED: then the container's status decides, not the answer.
  const upError = await api(container.uri ?? `https://rupload.facebook.com/ig-api-upload/v27.0/${container.id}`, {
    method: "POST", headers: { ...auth, offset: "0", file_size: String(size) }, body: await readFile(file),
  }).then(
    (up) => (up.success === false || up.debug_info ? JSON.stringify(up.debug_info ?? up) : undefined),
    (e: Error) => e.message,
  );
  if (upError) {
    const s = await api(`${FB}/${container.id}?fields=status_code,status`, { headers: auth }).catch(() => ({}) as any);
    if (!s.status_code || s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Instagram didn't take the upload: ${upError}`);
    log(`  the upload answered with an error, but the video is there (${s.status_code}): going on`);
  }
  const started = Date.now();
  for (;;) {
    await sleep(10_000);
    const s = await api(`${FB}/${container.id}?fields=status_code,status`, { headers: auth });
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Instagram couldn't take the video: ${s.status ?? s.status_code}`);
    if (Date.now() - started > 10 * 60_000) throw new Error(`Instagram is still processing after 10 min (container ${container.id})`);
    log("  processing…");
  }
  const media = await api(`${FB}/${ig.userId}/media_publish`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ creation_id: container.id }) });
  const info = await api(`${FB}/${media.id}?fields=permalink`, { headers: auth }).catch(() => ({}));
  return { id: media.id as string, url: (info as any).permalink as string | undefined, note: `@${ig.username}` };
}

// --- run (last, so everything above is defined) ----------------------------------------

if (words[0] === "login") {
  const which = words[1] as Platform;
  if (!PLATFORMS.includes(which)) usage();
  await ({ youtube: loginYoutube, instagram: loginInstagram, tiktok: loginTiktok } as const)[which]();
} else {
  const name = words[0];
  if (!name || !/^[\p{Ll}\p{N}][\p{Ll}\p{N}-]*$/u.test(name)) usage();
  const only = words.slice(1) as Platform[];
  for (const o of only) if (!PLATFORMS.includes(o)) usage();
  await release(name, only.length ? only : [...PLATFORMS]);
}
