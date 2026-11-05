// Watching a project's video in the browser and leaving comments at moments of it, for the
// planner to act on: npm run video -- comments <name> [--sample] [--port 4321].
// The comments go to projects/<name>/comments.yaml, each with where it is in the video, in
// the main recording, and in the plan.
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import YAML from "yaml";
import { openingMs } from "../remotion/Edit.tsx";
import type { EditManifest } from "../types.ts";
import { clock, type Paths } from "./project.ts";

export type Comment = {
  /** Seconds of the video. */
  t: number;
  text: string;
  /** Where that is: the opening title, a segment of the cut (with its seconds in the main recording), or the end card. */
  where?: string;
  segment?: number;
  recording?: number;
  done?: boolean;
};

export async function serveComments(p: Paths, o: { sample: boolean; port: number }) {
  const video = o.sample ? p.sample : p.out;
  if (!existsSync(video)) throw new Error(`No ${path.relative(process.cwd(), video)}: render it first`);
  const file = path.join(p.dir, "comments.yaml");
  const manifestFile = path.join(p.tmp, "manifest.json");
  const manifest = existsSync(manifestFile) ? (JSON.parse(await readFile(manifestFile, "utf8")) as EditManifest) : undefined;

  /** Where a moment of the video is: so a comment says what in the plan it's about. */
  const locate = (t: number): Pick<Comment, "where" | "segment" | "recording"> => {
    if (!manifest) return {};
    const intro = openingMs(manifest);
    const c = t * 1000 - intro;
    if (c < 0) return { where: "opening title" };
    const i = manifest.segments.findIndex((s) => c >= s.atMs && c < s.atMs + s.durationMs);
    if (i < 0) return { where: "end card" };
    const s = manifest.segments[i];
    const recording = Math.round((s.fromMs + c - s.atMs) / 100) / 10;
    return { where: `segment ${i + 1} (${s.layout}), ${recording} s of the recording`, segment: i + 1, recording };
  };

  const load = async (): Promise<Comment[]> => (existsSync(file) ? ((YAML.parse(await readFile(file, "utf8")) as { comments?: Comment[] })?.comments ?? []) : []);
  const save = async (list: Comment[]) => {
    const comments = list
      .filter((c) => c.text?.trim())
      .sort((a, b) => a.t - b.t)
      .map((c) => {
        const t = Math.round(c.t * 10) / 10;
        return { t, at: clock(t * 1000), ...locate(t), text: c.text.trim(), ...(c.done ? { done: true } : {}) };
      });
    const head = `# Comments on ${path.basename(video)} (npm run video -- comments ${path.basename(p.dir)}).\n# t: seconds of the video; recording: seconds of the main recording, as in plan.yaml.\n`;
    await writeFile(file, head + YAML.stringify({ video: path.basename(video), comments }));
    return comments;
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(page(path.basename(p.dir), path.basename(video)));
      } else if (url.pathname === "/video") {
        // Ranges, so the browser can seek.
        const size = statSync(video).size;
        const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
        if (range) {
          const start = range[1] ? Number(range[1]) : 0;
          const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
          res.writeHead(206, { "content-type": "video/mp4", "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1, "cache-control": "no-store" });
          createReadStream(video, { start, end }).pipe(res);
        } else {
          res.writeHead(200, { "content-type": "video/mp4", "accept-ranges": "bytes", "content-length": size, "cache-control": "no-store" });
          createReadStream(video).pipe(res);
        }
      } else if (url.pathname === "/comments" && req.method === "GET") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(await load()));
      } else if (url.pathname === "/comments" && req.method === "PUT") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const saved = await save(JSON.parse(body) as Comment[]);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(saved));
      } else if (url.pathname === "/where") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(locate(Number(url.searchParams.get("t") ?? 0))));
      } else {
        res.writeHead(404);
        res.end();
      }
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(String(e));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(o.port, "127.0.0.1", resolve);
  });
  console.log(`Comments on ${path.relative(process.cwd(), video)}: http://localhost:${o.port}`);
  console.log(`Saved as you go to ${path.relative(process.cwd(), file)}. Ctrl+C when done.`);
}

function page(name: string, video: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}: comments</title>
<style>
  :root { --bg: #16110f; --panel: #221a17; --line: #3a2d28; --ink: #f5ece7; --dim: #b39f96; --accent: #ff6a55; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.45 system-ui, sans-serif; }
  main { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 20px; padding: 20px; height: 100vh; }
  @media (max-width: 900px) { main { grid-template-columns: 1fr; height: auto; } }
  h1 { font-size: 15px; font-weight: 600; margin: 0 0 12px; color: var(--dim); }
  h1 b { color: var(--ink); }
  video { width: 100%; background: #000; border-radius: 10px; display: block; }
  .bar { display: flex; gap: 10px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
  .now { font-variant-numeric: tabular-nums; color: var(--dim); }
  button { background: var(--accent); color: #1a0d0a; border: 0; border-radius: 8px; padding: 8px 14px; font: inherit; font-weight: 600; cursor: pointer; }
  button.quiet { background: transparent; color: var(--dim); border: 1px solid var(--line); font-weight: 500; }
  kbd { border: 1px solid var(--line); border-radius: 4px; padding: 0 5px; font-size: 12px; color: var(--dim); }
  aside { background: var(--panel); border-radius: 10px; padding: 14px; overflow: auto; }
  .new textarea, .c textarea { width: 100%; min-height: 64px; background: var(--bg); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 8px; font: inherit; resize: vertical; }
  .new { display: none; margin-bottom: 14px; }
  .new.on { display: block; }
  .new .row { display: flex; gap: 8px; margin-top: 8px; }
  .c { border-top: 1px solid var(--line); padding: 10px 0; }
  .c .head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .c .time { color: var(--accent); cursor: pointer; font-variant-numeric: tabular-nums; font-weight: 600; background: none; padding: 0; }
  .c .where { color: var(--dim); font-size: 13px; }
  .c .text { white-space: pre-wrap; margin-top: 4px; cursor: text; }
  .c.done .text { opacity: 0.5; text-decoration: line-through; }
  .c .tools { display: flex; gap: 10px; font-size: 13px; }
  .c .tools a { color: var(--dim); cursor: pointer; }
  .empty { color: var(--dim); }
  .hint { color: var(--dim); font-size: 13px; margin-top: 10px; }
</style>
</head>
<body>
<main>
  <section>
    <h1><b>${name}</b> · ${video}</h1>
    <video id="v" src="/video" controls preload="auto"></video>
    <div class="bar">
      <button id="add">Comment here</button>
      <span class="now" id="now">0:00.0</span>
      <span class="now" id="where"></span>
    </div>
    <p class="hint"><kbd>C</kbd> comment at this moment (pauses) · <kbd>Space</kbd> play/pause · <kbd>←</kbd> <kbd>→</kbd> 1 s (<kbd>Shift</kbd> 5 s) · <kbd>,</kbd> <kbd>.</kbd> a frame · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> save</p>
  </section>
  <aside>
    <div class="new" id="new">
      <div class="now" id="newAt"></div>
      <textarea id="newText" placeholder="What should change here?"></textarea>
      <div class="row"><button id="save">Save</button><button class="quiet" id="cancel">Cancel</button></div>
    </div>
    <div id="list"></div>
  </aside>
</main>
<script>
const v = document.getElementById("v");
const $ = (id) => document.getElementById(id);
let comments = [];
let pendingT = 0;
const clock = (t) => { t = Math.max(0, t); return Math.floor(t / 60) + ":" + (t % 60).toFixed(1).padStart(4, "0"); };
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function load() { comments = await (await fetch("/comments")).json(); render(); }
async function store() {
  comments = await (await fetch("/comments", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(comments) })).json();
  render();
}
function render() {
  $("list").innerHTML = comments.length ? comments.map((c, i) => \`
    <div class="c\${c.done ? " done" : ""}" data-i="\${i}">
      <div class="head"><button class="time" data-seek="\${c.t}">\${clock(c.t)}</button><div class="tools"><a data-done="\${i}">\${c.done ? "undo" : "done"}</a><a data-del="\${i}">delete</a></div></div>
      \${c.where ? \`<div class="where">\${esc(c.where)}</div>\` : ""}
      <div class="text" data-edit="\${i}">\${esc(c.text)}</div>
    </div>\`).join("") : '<p class="empty">No comments yet. Pause where something should change and press C.</p>';
}
function openNew() {
  v.pause();
  pendingT = v.currentTime;
  $("newAt").textContent = "At " + clock(pendingT) + ($("where").textContent ? " · " + $("where").textContent : "");
  $("new").classList.add("on");
  $("newText").value = "";
  $("newText").focus();
}
async function saveNew() {
  const text = $("newText").value.trim();
  $("new").classList.remove("on");
  if (!text) return;
  comments.push({ t: pendingT, text });
  await store();
}
$("add").onclick = openNew;
$("save").onclick = saveNew;
$("cancel").onclick = () => $("new").classList.remove("on");
$("newText").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveNew();
  if (e.key === "Escape") $("new").classList.remove("on");
  e.stopPropagation();
});
$("list").addEventListener("click", async (e) => {
  const t = e.target;
  if (t.dataset.seek !== undefined) { v.currentTime = Number(t.dataset.seek); v.pause(); }
  else if (t.dataset.del !== undefined) { comments.splice(Number(t.dataset.del), 1); await store(); }
  else if (t.dataset.done !== undefined) { const c = comments[Number(t.dataset.done)]; c.done = !c.done; await store(); }
  else if (t.dataset.edit !== undefined) {
    const i = Number(t.dataset.edit);
    const box = document.createElement("textarea");
    box.value = comments[i].text;
    t.replaceWith(box);
    box.focus();
    const finish = async () => { comments[i].text = box.value; if (!box.value.trim()) comments.splice(i, 1); await store(); };
    box.addEventListener("blur", finish, { once: true });
    box.addEventListener("keydown", (k) => { if (k.key === "Enter" && (k.ctrlKey || k.metaKey)) box.blur(); k.stopPropagation(); });
  }
});
let lastWhere = -1;
v.addEventListener("timeupdate", async () => {
  $("now").textContent = clock(v.currentTime) + " / " + clock(v.duration || 0);
  const t = Math.round(v.currentTime * 10) / 10;
  if (t === lastWhere) return;
  lastWhere = t;
  const w = await (await fetch("/where?t=" + t)).json();
  $("where").textContent = w.where ?? "";
});
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "TEXTAREA") return;
  const step = e.shiftKey ? 5 : 1;
  if (e.key === "c" || e.key === "C") { e.preventDefault(); openNew(); }
  else if (e.key === " ") { e.preventDefault(); v.paused ? v.play() : v.pause(); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); v.currentTime -= step; }
  else if (e.key === "ArrowRight") { e.preventDefault(); v.currentTime += step; }
  else if (e.key === ",") { v.pause(); v.currentTime -= 1 / 30; }
  else if (e.key === ".") { v.pause(); v.currentTime += 1 / 30; }
});
load();
</script>
</body>
</html>`;
}
