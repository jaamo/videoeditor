// Kdenlive's file format: MLT XML, plus the kdenlive: properties Kdenlive 25–26 reads back.
// A bin (main_bin) of clips, and a sequence tractor holding the tracks: each track a tractor
// of two playlists (the second holds same-track transitions), audio tracks first.
// Read whole, changed, and written back, so everything made in Kdenlive stays as it was;
// or started empty, with Project.empty.
import { randomUUID } from "node:crypto";
import path from "node:path";

export type XmlNode = { tag: string; attrs: Record<string, string>; children: XmlNode[]; text: string };
export type Filter = Record<string, string> & { mlt_service: string };

/** A clip on a track: where it is, and which frames of which file (of it sped up, for a speed change). */
export type TimelineClip = {
  at: number; inF: number; outF: number; resource: string; speed: number;
  /** The producer's MLT service (avformat, chain, color, qimage, kdenlivetitle…), and the clip's effects. */
  service?: string; filters?: XmlNode[];
};
/** `hidden`: the track's eye (video) or speaker (audio) switched off in Kdenlive. */
export type TimelineTrack = { node: XmlNode; audio: boolean; playlists: XmlNode[]; clips: TimelineClip[]; hidden?: boolean; filters?: XmlNode[] };

export class Project {
  readonly mlt: XmlNode;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  /** The active sequence, and its tracks bottom to top. */
  readonly seq: XmlNode;
  readonly tracks: TimelineTrack[];
  private byId: Map<string, XmlNode>;
  private usedIds = new Set<string>();

  constructor(doc: string) {
    this.mlt = parseXml(doc);
    const walk = (n: XmlNode) => {
      if (n.attrs.id) this.usedIds.add(n.attrs.id);
      n.children.forEach(walk);
    };
    walk(this.mlt);
    const profile = this.mlt.children.find((n) => n.tag === "profile")!;
    this.fps = Number(profile.attrs.frame_rate_num) / Number(profile.attrs.frame_rate_den || 1);
    this.width = Number(profile.attrs.width);
    this.height = Number(profile.attrs.height);
    this.byId = new Map(this.mlt.children.filter((n) => n.attrs.id).map((n) => [n.attrs.id, n]));

    const bin = this.byId.get("main_bin");
    const projectTractor = this.mlt.children.find((n) => n.tag === "tractor" && prop(n, "kdenlive:projectTractor"));
    // The active sequence is named by its uuid; Kdenlive renumbers ids when it saves.
    const active = bin && prop(bin, "kdenlive:docproperties.activetimeline");
    const seq =
      (active && (this.byId.get(active) ?? this.mlt.children.find((n) => n.tag === "tractor" && prop(n, "kdenlive:uuid") === active))) ||
      this.byId.get(projectTractor?.children.find((n) => n.tag === "track")?.attrs.producer ?? "");
    if (!seq) throw new Error("No timeline found in the project");
    this.seq = seq;

    const root = this.mlt.attrs.root ?? "";
    this.tracks = [];
    for (const t of seq.children.filter((n) => n.tag === "track")) {
      const node = this.byId.get(t.attrs.producer);
      if (node?.tag !== "tractor") continue;
      const sub = node.children.filter((n) => n.tag === "track").map((s) => this.byId.get(s.attrs.producer)!);
      const clips: TimelineClip[] = [];
      for (const playlist of sub) {
        let pos = 0;
        for (const e of playlist.children) {
          if (e.tag === "blank") pos += this.frames(e.attrs.length);
          if (e.tag !== "entry") continue;
          const inF = this.frames(e.attrs.in);
          const outF = this.frames(e.attrs.out);
          const p = this.byId.get(e.attrs.producer)!;
          const warp = prop(p, "mlt_service") === "timewarp";
          const resource = path.resolve(root, (warp ? prop(p, "warp_resource") : prop(p, "resource")) ?? "");
          const service = warp ? "timewarp" : (prop(p, "mlt_service") ?? p.tag);
          clips.push({ at: pos, inF, outF, resource, speed: warp ? Number(prop(p, "warp_speed")) : 1, service, filters: e.children.filter((c) => c.tag === "filter") });
          pos += outF - inF + 1;
        }
      }
      const audio = prop(node, "kdenlive:audio_track") === "1";
      // Kdenlive hides a track on its playlists: a video track normally hides its audio, an
      // audio track its video; "both" is the eye (or the speaker) switched off.
      const hides = [t.attrs.hide, ...node.children.filter((n) => n.tag === "track").map((n) => n.attrs.hide)];
      const hidden = hides.some((h) => h === "both" || h === (audio ? "audio" : "video"));
      this.tracks.push({ node, audio, playlists: sub, clips: clips.sort((a, b) => a.at - b.at), hidden, filters: node.children.filter((c) => c.tag === "filter") });
    }
  }

  /** A project with nothing in it yet: empty tracks, bottom to top, audio ones first. */
  static empty(o: { width: number; height: number; fps: number; root: string; tracks: { name: string; audio: boolean }[] }) {
    const uuid = `{${randomUUID()}}`;
    const el = (tag: string, attrs: Record<string, string | number>, props: Record<string, string | number>, inner = "") => {
      const n = node(tag, attrs, props);
      n.children.push(...parseFragment(inner));
      return serialize(n, "");
    };
    let body = el("producer", { id: "black_track", in: 0, out: 0 }, {
      length: 2147483647,
      eof: "continue",
      resource: "black",
      aspect_ratio: 1,
      mlt_service: "color",
      "kdenlive:playlistid": "black_track",
      mlt_image_format: "rgba",
      "set.test_audio": 0,
    });
    o.tracks.forEach((t, i) => {
      const audio: Record<string, number> = t.audio ? { "kdenlive:audio_track": 1 } : {};
      body += el("playlist", { id: `playlist${2 * i}` }, audio) + el("playlist", { id: `playlist${2 * i + 1}` }, audio);
      const hide = t.audio ? "video" : "audio";
      body += el(
        "tractor",
        { id: `tractor${i}`, in: 0, out: 0 },
        { ...audio, "kdenlive:track_name": t.name, "kdenlive:trackheight": 62, "kdenlive:timeline_active": 1, "kdenlive:collapsed": 0 },
        `<track hide="${hide}" producer="playlist${2 * i}"/><track hide="${hide}" producer="playlist${2 * i + 1}"/>`,
      );
    });
    const audioCount = o.tracks.filter((t) => t.audio).length;
    // Each track mixed (audio) or laid (video) over the ones below it.
    const transitions = o.tracks
      .map((t, i) => {
        const common = { a_track: 0, b_track: i + 1, internal_added: 237, always_active: 1 };
        const p = t.audio
          ? { ...common, mlt_service: "mix", kdenlive_id: "mix", accepts_blanks: 1, sum: 1 }
          : { ...common, mlt_service: "qtblend", kdenlive_id: "qtblend", compositing: 0, distort: 0, rotate_center: 0 };
        return el("transition", { id: `transition${i}` }, p);
      })
      .join("");
    body += el(
      "tractor",
      { id: uuid, in: 0, out: 0 },
      {
        "kdenlive:uuid": uuid,
        "kdenlive:clipname": "Sequence 1",
        "kdenlive:sequenceproperties.hasAudio": 1,
        "kdenlive:sequenceproperties.hasVideo": 1,
        "kdenlive:sequenceproperties.activeTrack": audioCount,
        "kdenlive:sequenceproperties.tracksCount": o.tracks.length,
        "kdenlive:sequenceproperties.tracks": o.tracks.length,
        "kdenlive:sequenceproperties.documentuuid": uuid,
        "kdenlive:sequenceproperties.audioTarget": audioCount - 1,
        "kdenlive:sequenceproperties.videoTarget": audioCount,
        "kdenlive:sequenceproperties.zoom": 8,
        "kdenlive:sequenceproperties.groups": "[]",
        "kdenlive:sequenceproperties.guides": "[]",
        "kdenlive:control_uuid": uuid,
        "kdenlive:producer_type": 17,
        "kdenlive:id": 3,
        "kdenlive:clip_type": 0,
        "kdenlive:folderid": 2,
      },
      `<track producer="black_track"/>${o.tracks.map((_, i) => `<track producer="tractor${i}"/>`).join("")}${transitions}`,
    );
    body += el(
      "playlist",
      { id: "main_bin" },
      {
        "kdenlive:folder.-1.2": "Sequences",
        "kdenlive:sequenceFolder": 2,
        "kdenlive:docproperties.audioChannels": 2,
        "kdenlive:docproperties.version": "1.1",
        "kdenlive:docproperties.uuid": uuid,
        "kdenlive:docproperties.documentid": Date.now(),
        "kdenlive:docproperties.opensequences": uuid,
        "kdenlive:docproperties.activetimeline": uuid,
        "kdenlive:docproperties.enableproxy": 0,
        "kdenlive:docproperties.generateproxy": 0,
        "kdenlive:docproperties.renderprofile": "MP4-H264/AAC",
        "kdenlive:extraBins": "project_bin:-1:0",
        xml_retain: 1,
      },
      `<entry in="0" out="0" producer="${uuid}"/>`,
    );
    body += el("tractor", { id: `tractor${o.tracks.length}`, in: 0, out: 0 }, { "kdenlive:projectTractor": 1 }, `<track in="0" out="0" producer="${uuid}"/>`);
    const profile =
      `<profile description="${o.width}x${o.height} ${o.fps} fps" width="${o.width}" height="${o.height}" progressive="1" sample_aspect_num="1" sample_aspect_den="1" ` +
      `display_aspect_num="${o.width}" display_aspect_den="${o.height}" frame_rate_num="${o.fps}" frame_rate_den="1" colorspace="709"/>`;
    return new Project(`<mlt LC_NUMERIC="C" producer="main_bin" root="${esc(o.root)}" version="7.36.1">${profile}${body}</mlt>`);
  }

  /** "123" frames, or a clock time: "00:00:04.100", "00:00:04:03" (frames after the last colon). */
  frames(v = "0"): number {
    const parts = v.split(":").map(Number);
    if (parts.length === 1) return parts[0];
    if (parts.length === 4) return Math.round(((parts[0] * 60 + parts[1]) * 60 + parts[2]) * this.fps) + parts[3];
    return Math.round(parts.reduce((t, p) => t * 60 + p, 0) * this.fps);
  }

  /** Frames to the end of the last clip. */
  get length() {
    return Math.max(0, ...this.tracks.flatMap((t) => t.clips.map((c) => c.at + c.outF - c.inF + 1)));
  }

  /** The timeline's guides, by frame. */
  guides(): { pos: number; comment: string }[] {
    const json = prop(this.seq, "kdenlive:sequenceproperties.guides");
    const guides: { pos: number; comment?: string }[] = json?.trim() ? JSON.parse(json) : [];
    return guides.map((g) => ({ pos: Number(g.pos), comment: g.comment ?? "" })).sort((a, b) => a.pos - b.pos);
  }

  setGuides(guides: { pos: number; comment: string }[]) {
    setProp(this.seq, "kdenlive:sequenceproperties.guides", JSON.stringify(guides.map((g) => ({ ...g, type: 0 })), null, 4));
  }

  /** A new clip in the bin, and the copy of it the timeline uses (Kdenlive keeps one each). */
  addClip(name: string, resource: string, frames: number, o: { image?: boolean } = {}): string {
    const ids = this.mlt.children.map((n) => Number(prop(n, "kdenlive:id"))).filter(Number.isFinite);
    const props = {
      length: frames,
      eof: "pause",
      resource,
      // A still is Kdenlive's image clip, as long as it's placed for.
      ...(o.image ? { mlt_service: "qimage", ttl: 25, "kdenlive:clip_type": 5 } : { mlt_service: "avformat-novalidate", seekable: 1 }),
      "kdenlive:id": Math.max(3, ...ids) + 1,
      "kdenlive:control_uuid": `{${randomUUID()}}`,
      "kdenlive:clipname": name,
      "kdenlive:folderid": -1,
    };
    const binCopy = this.newId(o.image ? "producer" : "chain");
    const timelineCopy = this.newId(o.image ? "producer" : "chain");
    // Before anything that uses them.
    const first = this.mlt.children.findIndex((n) => n.tag !== "profile");
    const tag = o.image ? "producer" : "chain";
    this.mlt.children.splice(first, 0, node(tag, { id: binCopy, in: 0, out: frames - 1 }, props), node(tag, { id: timelineCopy, in: 0, out: frames - 1 }, props));
    this.byId.get("main_bin")!.children.push(node("entry", { in: 0, out: frames - 1, producer: binCopy }, {}));
    this.byId.set(timelineCopy, this.mlt.children[first + 1]);
    return timelineCopy;
  }

  /** A sped-up copy of a clip on the timeline (as made by addClip), as Kdenlive's speed change makes it. */
  addSpeed(producer: string, speed: number): string {
    const p = this.byId.get(producer)!;
    const resource = prop(p, "resource")!;
    const frames = Math.floor(Number(prop(p, "length")) / speed);
    const id = this.newId("producer");
    const first = this.mlt.children.findIndex((n) => n.tag !== "profile");
    const warp = node("producer", { id, in: 0, out: frames - 1 }, {
      length: frames,
      eof: "pause",
      resource: `${speed}:${resource}`,
      mlt_service: "timewarp",
      warp_speed: speed,
      warp_resource: resource,
      warp_pitch: 0,
      "kdenlive:id": prop(p, "kdenlive:id")!,
      "kdenlive:control_uuid": prop(p, "kdenlive:control_uuid")!,
      "kdenlive:clipname": prop(p, "kdenlive:clipname")!,
    });
    this.mlt.children.splice(first, 0, warp);
    this.byId.set(id, warp);
    return id;
  }

  /** Clips after the last one on a track, at frames, with their effects. */
  place(track: TimelineTrack, entries: { at: number; producer: string; inF: number; outF: number; filters?: Filter[] }[]) {
    const playlist = track.playlists[0];
    let pos = playlist.children.reduce((n, c) => n + (c.tag === "blank" ? this.frames(c.attrs.length) : c.tag === "entry" ? this.frames(c.attrs.out) - this.frames(c.attrs.in) + 1 : 0), 0);
    for (const e of entries) {
      if (e.at < pos) throw new Error(`Clips overlap at frame ${e.at}`);
      if (e.at > pos) playlist.children.push(node("blank", { length: e.at - pos }, {}));
      const entry = node("entry", { in: e.inF, out: e.outF, producer: e.producer }, {});
      for (const f of e.filters ?? []) {
        const { in: a, out: b, ...rest } = f;
        entry.children.push(node("filter", { id: this.newId("filter"), ...(a !== undefined && { in: a, out: b }) }, rest));
      }
      playlist.children.push(entry);
      pos = e.at + e.outF - e.inF + 1;
      const p = this.byId.get(e.producer)!;
      const warp = prop(p, "mlt_service") === "timewarp";
      track.clips.push({ at: e.at, inF: e.inF, outF: e.outF, resource: prop(p, warp ? "warp_resource" : "resource") ?? "", speed: warp ? Number(prop(p, "warp_speed")) : 1 });
    }
  }

  /** Clips that move together, each as [its track's index, its frame]. */
  setGroups(groups: [number, number][][]) {
    const json = groups.map((g) => ({ type: "Normal", children: g.map(([t, at]) => ({ type: "Leaf", leaf: "clip", data: `${t}:${at}:-1` })) }));
    setProp(this.seq, "kdenlive:sequenceproperties.groups", JSON.stringify(json, null, 4));
  }

  /** Moves everything on the timeline `frames` later: clips, guides and groups. */
  shift(frames: number) {
    for (const t of this.tracks) {
      for (const playlist of t.playlists) {
        const first = playlist.children.find((c) => c.tag === "blank" || c.tag === "entry");
        if (!first) continue;
        if (first.tag === "blank") first.attrs.length = String(this.frames(first.attrs.length) + frames);
        else playlist.children.splice(playlist.children.indexOf(first), 0, node("blank", { length: frames }, {}));
      }
      for (const c of t.clips) c.at += frames;
    }
    const guides = prop(this.seq, "kdenlive:sequenceproperties.guides");
    if (guides?.trim()) {
      const moved = (JSON.parse(guides) as { pos: number }[]).map((g) => ({ ...g, pos: Number(g.pos) + frames }));
      setProp(this.seq, "kdenlive:sequenceproperties.guides", JSON.stringify(moved, null, 4));
    }
    // A group's clips are "track:position:subplaylist".
    const groups = prop(this.seq, "kdenlive:sequenceproperties.groups");
    if (groups) setProp(this.seq, "kdenlive:sequenceproperties.groups", groups.replace(/"(\d+):(\d+)(:-?\d+)?"/g, (_, t, pos, rest = "") => `"${t}:${Number(pos) + frames}${rest}"`));
  }

  /** A clip at the very start of a track, where there's nothing yet (as after shift). */
  putFirst(track: TimelineTrack, producer: string, frames: number) {
    const playlist = track.playlists[0];
    const first = playlist.children.find((c) => c.tag === "blank" || c.tag === "entry");
    const blank = first?.tag === "blank" ? this.frames(first.attrs.length) : first ? 0 : Infinity;
    if (blank < frames) throw new Error(`No room for a ${frames}-frame clip at the start of the track`);
    const entry = node("entry", { in: 0, out: frames - 1, producer }, {});
    if (!first) playlist.children.push(entry);
    else if (first.tag === "blank" && blank === frames) playlist.children.splice(playlist.children.indexOf(first), 1, entry);
    else {
      first.attrs.length = String(blank - frames);
      playlist.children.splice(playlist.children.indexOf(first), 0, entry);
    }
    track.clips.unshift({ at: 0, inF: 0, outF: frames - 1, resource: "", speed: 1 });
  }

  /** The timeline's length, where it's written down (MLT plays only that far). */
  setLength(frames: number) {
    const tractors = [this.seq, ...this.tracks.map((t) => t.node)];
    for (const n of tractors) if (n.attrs.out !== undefined) n.attrs.out = String(frames - 1);
    const projectTractor = this.mlt.children.find((n) => n.tag === "tractor" && prop(n, "kdenlive:projectTractor"));
    for (const n of [projectTractor, ...(projectTractor?.children.filter((c) => c.tag === "track") ?? [])]) {
      if (n?.attrs.out !== undefined) n.attrs.out = String(frames - 1);
    }
  }

  /** An effect on a whole track, or on the sequence; its keyframes are in timeline frames. */
  addFilter(on: XmlNode, f: Filter) {
    on.children.push(node("filter", { id: this.newId("filter") }, f));
  }

  toString() {
    return `<?xml version='1.0' encoding='utf-8'?>\n${serialize(this.mlt, "")}`;
  }

  private newId(kind: string) {
    let n = 0;
    while (this.usedIds.has(`${kind}${n}`)) n++;
    this.usedIds.add(`${kind}${n}`);
    return `${kind}${n}`;
  }
}

export function prop(n: XmlNode, name: string): string | undefined {
  return n.children.find((c) => c.tag === "property" && c.attrs.name === name)?.text;
}

export function setProp(n: XmlNode, name: string, value: string | number) {
  const p = n.children.find((c) => c.tag === "property" && c.attrs.name === name);
  if (p) p.text = String(value);
  else {
    // Properties go before the element's tracks, entries and filters.
    const at = n.children.findIndex((c) => c.tag !== "property");
    n.children.splice(at < 0 ? n.children.length : at, 0, { tag: "property", attrs: { name }, children: [], text: String(value) });
  }
}

function node(tag: string, attrs: Record<string, string | number>, props: Record<string, string | number>): XmlNode {
  return {
    tag,
    attrs: Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, String(v)])),
    children: Object.entries(props).map(([name, v]) => ({ tag: "property", attrs: { name }, children: [], text: String(v) })),
    text: "",
  };
}

function parseFragment(s: string): XmlNode[] {
  return s ? parseXml(`<mlt>${s}</mlt>`).children : [];
}

/** Enough of XML for MLT: elements, attributes and text. */
function parseXml(s: string): XmlNode {
  const root: XmlNode = { tag: "", attrs: {}, children: [], text: "" };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (const m of s.matchAll(re)) {
    const top = stack.at(-1)!;
    if (m[1] !== undefined) top.text += m[1];
    else if (m[6] !== undefined) top.text += unesc(m[6]);
    else if (m[2]) stack.pop();
    else if (m[3]) {
      const attrs = Object.fromEntries([...m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((a) => [a[1], unesc(a[2] ?? a[3])]));
      const n: XmlNode = { tag: m[3], attrs, children: [], text: "" };
      top.children.push(n);
      if (!m[5]) stack.push(n);
    }
  }
  const mlt = root.children[0];
  if (mlt?.tag !== "mlt") throw new Error("Not a Kdenlive project");
  return mlt;
}

function serialize(n: XmlNode, indent: string): string {
  const attrs = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
  // An element with children has only whitespace between them.
  if (n.children.length) return `${indent}<${n.tag}${attrs}>\n${n.children.map((c) => serialize(c, `${indent} `)).join("")}${indent}</${n.tag}>\n`;
  if (n.text) return `${indent}<${n.tag}${attrs}>${escText(n.text)}</${n.tag}>\n`;
  return `${indent}<${n.tag}${attrs}/>\n`;
}

const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const esc = (s: string) => escText(s).replace(/"/g, "&quot;");
const unesc = (s: string) =>
  s.replace(/&(#x[\da-f]+|#\d+|lt|gt|quot|apos|amp);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" }[e.toLowerCase()]!,
  );
