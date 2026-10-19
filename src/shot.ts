// Screenshot app pages as the demo user, to look at a screen before scripting it.
//   npm run shot -- /transcripts /studio/12
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const paths = process.argv.slice(2);
if (!paths.length) throw new Error("Usage: npm run shot -- <path> [path...]");

const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL: process.env.OUTERVIEW_URL || "http://localhost:5000",
  viewport: { width: 1280, height: 800 },
});
const res = await context.request.post("/api/login", {
  data: { email: process.env.OUTERVIEW_EMAIL, password: process.env.OUTERVIEW_PASSWORD },
});
if (!res.ok()) throw new Error(`Login failed: ${res.status()} ${await res.text()}`);

const page = await context.newPage();
await page.goto("/");
await page.evaluate(() => localStorage.setItem("cookie-consent", "declined"));
await mkdir("out/shots", { recursive: true });
for (const p of paths) {
  await page.goto(p, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const file = `out/shots/${p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root"}.png`;
  await page.screenshot({ path: file });
  console.log(file, "→", page.url());
}
await browser.close();
