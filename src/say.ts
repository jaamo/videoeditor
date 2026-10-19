// Hear lines before putting them in a video, e.g. to try spellings in pronounce.ts.
//   npm run say -- --lang fi "Tämä on Outerview." "Tämä on Autörvjuu."
//   --raw skips pronounce.ts, to hear exactly what is typed.
// Writes out/say/<n>-<text>.mp3. Lines are cached like video narration.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pronounce } from "../pronounce.ts";
import { narrate, respell } from "./voice.ts";

const args = process.argv.slice(2);
const langAt = args.indexOf("--lang");
const lang = langAt >= 0 ? args.splice(langAt, 2)[1] : "en";
const raw = args.includes("--raw");
const lines = args.filter((a) => !a.startsWith("--"));
if (!lines.length) throw new Error('Usage: npm run say -- [--lang fi] [--raw] "line" ["line"...]');

if (raw) delete pronounce[lang];
const dir = path.resolve("out/say");
await mkdir(dir, { recursive: true });
for (const [i, line] of lines.entries()) {
  const n = await narrate(line, { lang });
  const slug = line.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40);
  const file = path.join(dir, `${i + 1}-${slug}.mp3`);
  await writeFile(file, n.mp3);
  const sent = respell(line, lang);
  console.log(`${file}${sent !== line ? `   (said as: ${sent})` : ""}`);
}
