import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Locator, type Page } from "playwright";
import { connect } from "./db.ts";
import type { Box, Director, Frame, TimelineEvent, VideoScript } from "./types.ts";

/** Pixel density of the capture. 2× keeps text sharp when the camera zooms in. */
const SCALE = 2;

export type StepTiming = { startMs: number; endMs: number };

export type Recording = {
  frames: Frame[];
  events: TimelineEvent[];
  steps: StepTiming[];
  durationMs: number;
  viewport: { width: number; height: number };
};

/**
 * Plays the script in a real browser and captures it frame by frame. Each step lasts at
 * least as long as its narration (`minStepMs`), so the recording comes out in sync
 * with the voice and nothing has to be re-timed afterwards.
 */
export async function record(script: VideoScript, outDir: string, minStepMs: number[]): Promise<Recording> {
  const baseURL = process.env.OUTERVIEW_URL || "http://localhost:5000";
  const viewport = script.viewport ?? { width: 1280, height: 800 };
  const framesDir = path.join(outDir, "frames");
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  // A fake microphone and camera, so the interview screens get past their device checks.
  const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const context = await browser.newContext({
    baseURL, viewport, deviceScaleFactor: SCALE, permissions: ["microphone", "camera"],
  });
  const db = connect();
  // The support chat bubble would sit in the corner of every shot.
  await context.route(/getresolved\.ai/, (r) => r.abort());
  try {
    const userId = await login(context.request, baseURL);
    const page = await context.newPage();
    // Answer cookie consent up front so the banner never covers a shot. "declined" also
    // keeps analytics from counting the recording as a visit.
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("cookie-consent", "declined"));
    await page.goto(script.start, { waitUntil: "networkidle" });
    if (script.setup) await script.setup({ page, sql: db.sql, userId });

    // Park the real mouse where the drawn cursor starts.
    const cursorStart = { x: viewport.width * 0.6, y: viewport.height * 0.6 };
    await page.mouse.move(cursorStart.x, cursorStart.y);

    // --- capture -----------------------------------------------------------
    // Not Page.startScreencast: it always delivers frames at 1×, whatever the pixel
    // density. A screenshot with a scaled clip comes back at full 2×, and with a few
    // requests in flight Chrome keeps up at ~30fps.
    let cdp = await context.newCDPSession(page);
    let stalls = 0;
    const frames: Frame[] = [];
    const writes: Promise<void>[] = [];
    const t0 = Date.now();
    // Time cut out by d.cut() doesn't count: the video's clock runs without it.
    let skipped = 0;
    const now = () => Date.now() - t0 - skipped;
    let capturing = true;
    // While a cut runs, frames go here, to be squeezed into its kept length afterwards.
    let cutFrames: Frame[] | null = null;
    let frameNo = 0;
    // Capture pauses across a full page load (d.goto): Chrome may stop answering
    // screenshots while a page with live media tears down, and replies that do come back
    // late can't be dated. `epoch` moves on at each pause, and a reply to a request sent
    // in an earlier epoch is thrown away.
    let paused = false;
    let epoch = 0;
    const clip = { x: 0, y: 0, width: viewport.width, height: viewport.height, scale: SCALE };
    const lane = async () => {
      while (capturing) {
        if (paused) {
          await new Promise((r) => setTimeout(r, 15));
          continue;
        }
        const sent = now();
        const session = cdp;
        const myEpoch = epoch;
        let data: string;
        try {
          ({ data } = await withTimeout(
            session.send("Page.captureScreenshot", { format: "jpeg", quality: 85, optimizeForSpeed: true, clip }),
            3_000,
            "stalled",
          ));
        } catch (e) {
          if (!capturing) return;
          // A session already replaced fails its pending requests as it goes; not an error.
          if (session !== cdp || myEpoch !== epoch) continue;
          // Chrome occasionally stops answering screenshots on a session, seen across a
          // full page load. A fresh one carries on; the last frame holds in the meantime.
          if ((e as Error).message !== "stalled" || ++stalls > 5) throw e;
          console.log(`  capture stalled in step ${stepNo}; reconnecting`);
          cdp = await context.newCDPSession(page);
          session.detach().catch(() => {});
          continue;
        }
        if (myEpoch !== epoch || paused) continue;
        // The pixels were grabbed somewhere between request and reply: the middle, for a
        // normal reply; just before the reply, for a slow one, which waited for a new frame.
        const replied = now();
        const t = replied - sent > 250 ? replied - 20 : Math.round((sent + replied) / 2);
        const file = `frames/${String(frameNo++).padStart(5, "0")}.jpg`;
        (cutFrames ?? frames).push({ file, t });
        writes.push(writeFile(path.join(outDir, file), Buffer.from(data, "base64")));
      }
    };
    let stepNo = 0;
    // A lane that fails stops the recording: its error surfaces from the step loop.
    let laneError: unknown;
    const lanes = [lane(), lane(), lane()].map((l) => l.catch((e) => void (laneError ??= e)));

    const events: TimelineEvent[] = [{ type: "move", t: 0, to: cursorStart, durationMs: 0 }];
    const pauseCapture = () => {
      paused = true;
      epoch++;
    };
    const resumeCapture = async () => {
      const old = cdp;
      cdp = await context.newCDPSession(page);
      old.detach().catch(() => {});
      epoch++;
      paused = false;
    };
    let inCut = false;
    const cut = async (fn: () => Promise<unknown>, keepMs: number) => {
      if (inCut) return void (await fn());
      inCut = true;
      const start = now();
      cutFrames = [];
      try {
        await fn();
      } finally {
        const real = now() - start;
        const keep = Math.min(keepMs, real);
        const scale = real > 0 ? keep / real : 0;
        for (const f of cutFrames) frames.push({ file: f.file, t: start + Math.round((f.t - start) * scale) });
        cutFrames = null;
        inCut = false;
        events.push({ type: "cut", t: start, keepMs: keep, speed: keep > 0 ? real / keep : 0 });
        skipped += real - keep;
      }
    };
    // DEBUG=1: say when the page changes address, on the video's clock.
    if (process.env.DEBUG) {
      page.on("framenavigated", (f) => f === page.mainFrame() && console.log(`  [${now()}ms] navigated: ${f.url()}`));
      page.on("console", (m) => m.type() === "error" && console.log(`  [${now()}ms] console error: ${m.text().slice(0, 160)}`));
    }
    const d = director(page, events, now, cut, { pause: pauseCapture, resume: resumeCapture });
    const steps: StepTiming[] = [];

    // A beat on the opening screen before anything moves.
    await d.wait(400);
    for (const [i, step] of script.steps.entries()) {
      stepNo = i + 1;
      console.log(`  step ${stepNo}/${script.steps.length}${step.label ? `: ${step.label}` : ""}`);
      if (laneError) throw laneError;
      const startMs = now();
      const firstEvent = events.length;
      try {
        await step.do?.(d);
      } catch (e) {
        const shot = path.join(outDir, "error.png");
        await page.screenshot({ path: shot }).catch(() => {});
        console.log(`  step ${stepNo} failed; the page at that moment: ${shot}`);
        throw e;
      }
      const endMs = Math.max(now(), startMs + minStepMs[i]) + (step.pauseAfterMs ?? 300);
      await d.wait(endMs - now());
      // Spotlights with no explicit length last until the step ends.
      for (const e of events.slice(firstEvent)) if (e.type === "highlight" && e.untilMs < 0) e.untilMs = endMs;
      steps.push({ startMs, endMs });
    }
    await d.wait(300);
    const durationMs = now();

    capturing = false;
    await Promise.all(lanes);
    if (laneError) throw laneError;
    await Promise.all(writes);
    if (frames.length === 0) throw new Error("No frames captured");
    frames.sort((a, b) => a.t - b.t);
    frames[0].t = 0;
    return { frames, events, steps, durationMs, viewport };
  } finally {
    await browser.close();
    await db.close();
  }
}

/**
 * Where a phrase sits inside a textarea, in viewport px. A textarea has no DOM for its
 * text, so lay the same text out in an invisible copy with the same styles and measure
 * a span around the phrase. Runs in the page.
 */
function measurePhrase(el: HTMLTextAreaElement | HTMLInputElement, text: string): Box | null {
  const i = el.value.indexOf(text);
  if (i < 0) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const mirror = document.createElement("div");
  for (const p of [
    "fontFamily", "fontSize", "fontWeight", "fontVariationSettings", "lineHeight", "letterSpacing",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "boxSizing", "tabSize",
  ] as const) mirror.style[p] = cs[p];
  Object.assign(mirror.style, {
    position: "fixed", left: `${r.left}px`, top: `${r.top - el.scrollTop}px`, width: `${r.width}px`,
    whiteSpace: "pre-wrap", overflowWrap: "break-word", visibility: "hidden", borderStyle: "solid",
  });
  mirror.textContent = el.value.slice(0, i);
  const span = document.createElement("span");
  span.textContent = text;
  mirror.appendChild(span);
  document.body.appendChild(mirror);
  const s = span.getBoundingClientRect();
  mirror.remove();
  return { x: s.left, y: s.top, width: s.width, height: s.height };
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(message)), ms))),
  ]);
}

async function login(request: import("playwright").APIRequestContext, baseURL: string) {
  const email = process.env.OUTERVIEW_EMAIL;
  const password = process.env.OUTERVIEW_PASSWORD;
  if (!email || !password) throw new Error("Set OUTERVIEW_EMAIL and OUTERVIEW_PASSWORD in .env");
  const res = await request.post("/api/login", { data: { email, password } });
  if (!res.ok()) throw new Error(`Login to ${baseURL} failed: ${res.status()} ${await res.text()}`);
  const me = await request.get("/api/auth/user");
  const user = me.ok() ? ((await me.json()) as { id?: string }) : {};
  if (!user.id) throw new Error(`Logged in, but GET /api/auth/user gave no user id (${me.status()})`);
  return user.id;
}

function director(
  page: Page,
  events: TimelineEvent[],
  now: () => number,
  cut: (fn: () => Promise<unknown>, keepMs: number) => Promise<void>,
  capture: { pause: () => void; resume: () => Promise<void> },
): Director {
  let cursor = { x: 0, y: 0 };
  const wait = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

  async function locate(selector: string): Promise<{ loc: Locator; box: Box }> {
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: "visible", timeout: 30_000 });
    await loc.scrollIntoViewIfNeeded();
    const box = await loc.boundingBox();
    if (!box) throw new Error(`No bounding box for ${selector}`);
    return { loc, box };
  }

  /** One box around every visible match. */
  async function locateAll(selector: string): Promise<{ box: Box }> {
    const visible = page.locator(selector).filter({ visible: true });
    await visible.first().waitFor({ state: "visible", timeout: 30_000 });
    await visible.first().scrollIntoViewIfNeeded();
    const all = (await Promise.all((await visible.all()).map((l) => l.boundingBox()))).filter(
      (b): b is Box => !!b && b.width > 0,
    );
    if (!all.length) throw new Error(`Nothing visible matches ${selector}`);
    const x = Math.min(...all.map((b) => b.x));
    const y = Math.min(...all.map((b) => b.y));
    const right = Math.max(...all.map((b) => b.x + b.width));
    const bottom = Math.max(...all.map((b) => b.y + b.height));
    return { box: { x, y, width: right - x, height: bottom - y } };
  }

  /** Glide the cursor. The drawn cursor animates over `durationMs`; the real one follows. */
  async function moveTo(to: { x: number; y: number }) {
    const dist = Math.hypot(to.x - cursor.x, to.y - cursor.y);
    const durationMs = Math.round(Math.min(900, Math.max(350, dist * 0.9)));
    events.push({ type: "move", t: now(), to, durationMs });
    const start = Date.now();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    cursor = to;
    await wait(durationMs - (Date.now() - start));
  }

  const center = (b: Box) => ({ x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) });

  const d: Director = {
    page,
    async click(selector) {
      const { box } = await locate(selector);
      events.push({ type: "camera", t: now(), box });
      const at = center(box);
      await moveTo(at);
      await wait(120);
      events.push({ type: "click", t: now(), at });
      await page.mouse.click(at.x, at.y);
      await wait(250);
    },
    async type(selector, text, opts = {}) {
      await d.click(selector);
      if (opts.clear) {
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.press("Backspace");
      }
      await page.keyboard.type(text, { delay: opts.delayMs ?? 45 });
    },
    async select(selector, text) {
      const { loc, box: field } = await locate(selector);
      const box = await loc.evaluate(measurePhrase, text);
      if (!box) throw new Error(`"${text}" not found in ${selector}`);
      // Frame the whole line, not just the phrase, so no text is cut off at the sides.
      events.push({ type: "camera", t: now(), box: { x: field.x, width: field.width, y: box.y - 40, height: box.height + 80 } });
      const y = box.y + box.height / 2;
      await moveTo({ x: Math.round(box.x), y });
      await wait(150);
      await moveTo({ x: Math.round(box.x + box.width), y });
      // Set the selection directly; a real drag lands on whatever pixel the text is at.
      await loc.evaluate((el: HTMLTextAreaElement | HTMLInputElement, t) => {
        const i = el.value.indexOf(t);
        el.focus({ preventScroll: true });
        el.setSelectionRange(i, i + t.length);
      }, text);
      await wait(300);
    },
    async keys(text, opts = {}) {
      await page.keyboard.type(text, { delay: opts.delayMs ?? 60 });
    },
    async highlight(selector, opts = {}) {
      const { box } = opts.all ? await locateAll(selector) : await locate(selector);
      const t = now();
      events.push({ type: "camera", t, box });
      events.push({ type: "highlight", t, box, untilMs: opts.ms ? t + opts.ms : -1 });
    },
    async focus(selector) {
      const { box } = await locate(selector);
      events.push({ type: "camera", t: now(), box });
    },
    async overview() {
      events.push({ type: "camera", t: now(), box: null });
    },
    async hover(selector) {
      const { box } = await locate(selector);
      events.push({ type: "camera", t: now(), box });
      await moveTo(center(box));
    },
    async scrollTo(selector) {
      await page.locator(selector).first().evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
      await wait(900);
    },
    // A full page load is a straight cut: capture pauses while it loads, and the video
    // cross-fades from the old page to the new one.
    async goto(p) {
      await cut(async () => {
        capture.pause();
        try {
          await page.goto(p, { waitUntil: "networkidle" });
        } finally {
          await capture.resume();
        }
      }, 0);
      // A new page starts in full view, with no pan across from where the old one was.
      events.push({ type: "camera", t: now(), box: null, instant: true });
    },
    wait,
    cut: (fn, opts = {}) => cut(fn, opts.keepMs ?? 1200),
  };
  return d;
}
