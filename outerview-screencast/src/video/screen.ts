// What happens on the screen recording, found from its pixels: clicks (the rings `npm run
// clicks` draws), page changes, and where things move.
import { frames } from "./media.ts";

export type Box = [x: number, y: number, w: number, h: number];
export type ScreenEvents = {
  /** A click ring appearing, in ms of the screen recording, where (in its pixels). */
  clicks: { ms: number; x: number; y: number }[];
  /** Most of the screen changed at once: a new page, a dialog. */
  changes: { ms: number; share: number }[];
  /** Something changing in one place for a while (typing, an answer coming in). */
  activity: { fromMs: number; toMs: number; box: Box }[];
};

const FPS = 5;
const SW = 960;
const SH = 540;
/** The click ring's colour (click-circles.py's default, #ff4081), and how near counts. */
const RING = [0xff, 0x40, 0x81];
const RING_NEAR = 60;
const CELL = 30; // grid cells for change, in scaled pixels: 32 × 18
const CHANGE_DIFF = 24;

export async function screenEvents(file: string, size: { width: number; height: number }): Promise<ScreenEvents> {
  const sx = size.width / SW;
  const sy = size.height / SH;
  const clicks: ScreenEvents["clicks"] = [];
  const changes: ScreenEvents["changes"] = [];
  const cellsX = SW / CELL;
  const cellsY = SH / CELL;
  const active: { ms: number; cells: Set<number> }[] = [];
  const history: Buffer[] = [];
  let lastClickMs = -Infinity;
  // How often each cell has the ring's colour at all: where it's often, it's the app's own pink.
  const pinkHeat = new Uint32Array((SW / CELL) * (SH / CELL));
  let frameCount = 0;

  await frames(file, { fps: FPS, width: SW, height: SH }, (rgb, ms) => {
    const frame = Buffer.from(rgb);
    const before = history.at(-1);
    const longAgo = history[0]; // a second back: the ring wasn't there yet

    // Ring pixels new since a second ago, so the app's own pink doesn't count.
    if (longAgo) {
      const xs: number[] = [];
      const ys: number[] = [];
      const seen = new Uint8Array(pinkHeat.length);
      for (let y = 0; y < SH; y += 2) {
        for (let x = 0; x < SW; x += 2) {
          const i = (y * SW + x) * 3;
          if (!near(frame, i)) continue;
          seen[Math.floor(y / CELL) * (SW / CELL) + Math.floor(x / CELL)] = 1;
          if (!near(longAgo, i)) xs.push(x), ys.push(y);
        }
      }
      for (let c = 0; c < seen.length; c++) pinkHeat[c] += seen[c];
      frameCount++;
      // Around the middle of them, so new pink elsewhere doesn't spread the ring out.
      const mx = [...xs].sort((a, b) => a - b)[xs.length >> 1];
      const my = [...ys].sort((a, b) => a - b)[ys.length >> 1];
      let n = 0;
      let x0 = SW, y0 = SH, x1 = 0, y1 = 0;
      for (let k = 0; k < xs.length; k++) {
        if (Math.abs(xs[k] - mx) > 45 || Math.abs(ys[k] - my) > 45) continue;
        n++;
        x0 = Math.min(x0, xs[k]); y0 = Math.min(y0, ys[k]); x1 = Math.max(x1, xs[k]); y1 = Math.max(y1, ys[k]);
      }
      // A ring: enough of it, no bigger than one, round, and hollow (its pixels about as far from its middle).
      const w = x1 - x0;
      const h = y1 - y0;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const ds: number[] = [];
      for (let k = 0; k < xs.length; k++) {
        if (Math.abs(xs[k] - mx) > 45 || Math.abs(ys[k] - my) > 45) continue;
        ds.push(Math.hypot(xs[k] - cx, ys[k] - cy));
      }
      const r = ds.reduce((a, b) => a + b, 0) / (ds.length || 1);
      const spread = Math.sqrt(ds.reduce((a, d) => a + (d - r) ** 2, 0) / (ds.length || 1)) / (r || 1);
      const round = w > 6 && h > 6 && w < 70 && h < 70 && Math.abs(w - h) < 0.35 * Math.max(w, h);
      if (n >= 12 && round && r >= 4 && spread < 0.25 && ms - lastClickMs > 400) {
        clicks.push({ ms, x: Math.round(((x0 + x1) / 2) * sx), y: Math.round(((y0 + y1) / 2) * sy) });
        lastClickMs = ms;
      }
    }

    if (before) {
      const cells = new Set<number>();
      for (let cy = 0; cy < cellsY; cy++) {
        for (let cx = 0; cx < cellsX; cx++) {
          let diff = 0;
          for (let y = cy * CELL; y < (cy + 1) * CELL; y += 3) {
            for (let x = cx * CELL; x < (cx + 1) * CELL; x += 3) {
              const i = (y * SW + x) * 3;
              diff += Math.abs(frame[i] - before[i]) + Math.abs(frame[i + 1] - before[i + 1]) + Math.abs(frame[i + 2] - before[i + 2]);
            }
          }
          if (diff / 100 > CHANGE_DIFF) cells.add(cy * cellsX + cx);
        }
      }
      const share = cells.size / (cellsX * cellsY);
      if (share > 0.35) {
        if (!changes.length || ms - changes.at(-1)!.ms > 1000) changes.push({ ms, share: Math.round(share * 100) / 100 });
      } else if (cells.size) active.push({ ms, cells });
    }

    history.push(frame);
    if (history.length > FPS) history.shift();
  });

  // Not where the app itself is pink a tenth of the time or more.
  const real = clicks.filter((c) => pinkHeat[Math.floor(c.y / sy / CELL) * (SW / CELL) + Math.floor(c.x / sx / CELL)] < 0.1 * frameCount);

  // Change in the same area, frame after frame, as one stretch of activity.
  const activity: ScreenEvents["activity"] = [];
  let cur: { fromMs: number; toMs: number; box: Box } | undefined;
  for (const a of active) {
    const box = boxOf(a.cells, cellsX);
    if (cur && a.ms - cur.toMs <= 1000 && overlaps(cur.box, box)) {
      cur.toMs = a.ms;
      cur.box = union(cur.box, box);
    } else {
      if (cur && cur.toMs - cur.fromMs >= 800) activity.push(cur);
      cur = { fromMs: a.ms, toMs: a.ms, box };
    }
  }
  if (cur && cur.toMs - cur.fromMs >= 800) activity.push(cur);

  const scale = (b: Box): Box => [Math.round(b[0] * CELL * sx), Math.round(b[1] * CELL * sy), Math.round(b[2] * CELL * sx), Math.round(b[3] * CELL * sy)];
  return { clicks: real, changes, activity: activity.map((a) => ({ ...a, box: scale(a.box) })) };
}

function near(f: Buffer, i: number) {
  return Math.abs(f[i] - RING[0]) + Math.abs(f[i + 1] - RING[1]) + Math.abs(f[i + 2] - RING[2]) < RING_NEAR;
}

/** Cells as a box, in cells. */
function boxOf(cells: Set<number>, cellsX: number): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cells) {
    const x = c % cellsX;
    const y = Math.floor(c / cellsX);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

const overlaps = (a: Box, b: Box) => a[0] <= b[0] + b[2] + 1 && b[0] <= a[0] + a[2] + 1 && a[1] <= b[1] + b[3] + 1 && b[1] <= a[1] + a[3] + 1;

function union(a: Box, b: Box): Box {
  const x0 = Math.min(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]);
  return [x0, y0, Math.max(a[0] + a[2], b[0] + b[2]) - x0, Math.max(a[1] + a[3], b[1] + b[3]) - y0];
}
