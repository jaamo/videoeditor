// A b-roll pass over a timeline as it is (the user may have cut the A-roll by hand): every usable
// section of the second camera goes on V2 where the A-roll piece shot at the same real moment
// sits in the cut, in the first free slot, in ride order. V1 is never touched.
import type { Source, Summary } from "../project.ts";

/** A usable stretch of a b-roll file, as the analyzer lists them (analysis/broll-sections*.json). */
export type BrollSection = { file: string; from: number; to: number; rotation?: number; what?: string; talk?: boolean };
/** One item of a timeline dump (tmp/timeline.json, from `mcp dump`). */
export type DumpItem = { media: string | null; srcStart: number; srcEnd: number; atS: number; endS: number; name: string };
export type Dump = { fps: number; tracks: Record<string, DumpItem[]> };
export type Placement = { key: string; inF: number; outF: number; atF: number; atS: number; lenS: number; rotation: number; what: string; shiftS: number };
export type BrollOptions = { maxLen?: number; minLen?: number; gap?: number; maxShift?: number; keepTalk?: boolean };

const track = (d: Dump, n: number) => Object.entries(d.tracks).find(([k]) => k.startsWith(`video ${n} `))?.[1] ?? [];

export function placeBroll(dump: Dump, summary: Summary, sections: BrollSection[], o: BrollOptions = {}): { placed: Placement[]; skipped: { file: string; from: number; to: number; why: string }[]; cutEndS: number } {
  const { maxLen = 10, minLen = 2, gap = 4, maxShift = 240, keepTalk = false } = o;
  const fps = dump.fps;
  const src: Record<string, Source> = { ...summary.aroll, ...summary.broll };
  const realOf = (key: string, s: number) => new Date(src[key].realAt!).getTime() / 1000 + s;
  // V1: each piece's real-time range and place in the cut.
  const v1 = track(dump, 1)
    .filter((it) => it.media && src[it.media]?.realAt)
    .map((it) => {
      const s = src[it.media!];
      return { r0: realOf(it.media!, it.srcStart / s.fps), r1: realOf(it.media!, it.srcEnd / s.fps), at: it.atS, end: it.endS };
    })
    .sort((a, b) => a.at - b.at);
  if (!v1.length) throw new Error("No A-roll piece on V1 with a known time (realAt in summary.json): analyze first");
  const cutEndS = Math.max(...v1.map((p) => p.end));
  const placeOf = (r: number): [number, number] => {
    let best: [number, number] | undefined;
    for (const p of v1) {
      if (p.r0 <= r && r <= p.r1) return [p.at + (r - p.r0), 0];
      const dist = r < p.r0 ? p.r0 - r : r - p.r1;
      if (!best || dist < best[1]) best = [r < p.r0 ? p.at : p.end, dist];
    }
    return best!;
  };
  // V2 as it is: the slots taken, and the stretches of each file already there.
  const busy: [number, number][] = [[0, 3]];
  const used: Record<string, [number, number][]> = {};
  for (const it of track(dump, 2)) {
    busy.push([it.atS, it.endS]);
    if (it.media && src[it.media]) (used[it.media] ??= []).push([it.srcStart / src[it.media].fps, it.srcEnd / src[it.media].fps]);
  }
  for (const t of track(dump, 3)) if (/main title/i.test(t.name)) busy.push([t.atS - 0.5, t.endS + 0.5]);
  const free = (at: number, len: number) => {
    let t = at;
    for (;;) {
      const hit = busy.filter((b) => b[0] - gap < t + len && b[1] + gap > t);
      if (!hit.length) return t;
      t = Math.max(...hit.map((h) => h[1])) + gap;
    }
  };
  const secs = sections
    .filter((x) => (keepTalk || !x.talk) && src[x.file]?.realAt && x.to - x.from >= minLen)
    .sort((a, b) => realOf(a.file, a.from) - realOf(b.file, b.from));
  const placed: Placement[] = [];
  const skipped: { file: string; from: number; to: number; why: string }[] = [];
  for (const x of secs) {
    let a: number | undefined = x.from;
    let b = x.to;
    for (const [u0, u1] of used[x.file] ?? []) {
      if (a !== undefined && a < u1 && b > u0) {
        if (u0 - a >= minLen) b = u0;
        else if (b - u1 >= minLen) a = u1;
        else a = undefined;
      }
    }
    if (a === undefined) {
      skipped.push({ file: x.file, from: x.from, to: x.to, why: "already on V2" });
      continue;
    }
    if (b - a > maxLen) b = a + maxLen;
    const [ideal] = placeOf(realOf(x.file, a));
    const at = free(ideal, b - a);
    if (at + (b - a) > cutEndS - 1) {
      skipped.push({ file: x.file, from: a, to: b, why: "past the end of the cut" });
      continue;
    }
    if (Math.abs(at - ideal) > maxShift) {
      skipped.push({ file: x.file, from: a, to: b, why: `no room within ${maxShift} s of its moment (${ideal.toFixed(0)} s)` });
      continue;
    }
    busy.push([at, at + (b - a)]);
    (used[x.file] ??= []).push([a, b]);
    const f = src[x.file].fps;
    placed.push({ key: x.file, inF: Math.round(a * f), outF: Math.round(b * f), atF: Math.round(at * fps), atS: Math.round(at * 100) / 100, lenS: Math.round((b - a) * 100) / 100, rotation: x.rotation ?? 0, what: x.what ?? "", shiftS: Math.round((at - ideal) * 10) / 10 });
  }
  return { placed, skipped, cutEndS };
}
