import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractEmojiStrike } from "./sfnt";

export type RenderSource = "twitter" | "bluesky" | "threads";

/** An image as a data URL or bare base64. */
type ImageData = string;

export interface XAuthor {
  name: string;
  handle: string;
  verified?: "none" | "blue" | "business" | "government";
  avatar?: ImageData;
}

export interface XMedia {
  kind: "image" | "gif" | "video";
  width: number;
  height: number;
  data?: ImageData;
  alt?: string;
  duration?: number;
}

export interface XLink {
  card?: "summary" | "summary_large_image";
  title?: string;
  description?: string;
  domain?: string;
  image?: { width: number; height: number; data?: ImageData };
}

/** xeet's post input; see `crates/xeet-core/src/model.rs` in the fork. */
export interface XPost {
  text: string;
  author: XAuthor;
  media?: XMedia[];
  /** Keyed by the URL as written in `text`. */
  links?: Record<string, XLink>;
  quote?: XPost;
  /** ISO 8601 with the reader's offset: xeet formats in the offset it is given. */
  createdAt?: string;
  /** Reference time for relative labels, such as a quote's "2h". */
  now?: string;
  counts?: {
    replies?: number;
    reposts?: number;
    likes?: number;
    views?: number;
    bookmarks?: number;
  };
  replyTo?: string;
  replyToHandle?: string;
}

/** A stretch of display text; `link` takes the source's link color. */
export interface TextRun {
  text: string;
  link?: boolean;
}

export interface ThreadsAuthor {
  name: string;
  initials: string;
  verified?: boolean;
  avatar?: ImageData;
}

export interface ThreadsMedia {
  src?: ImageData;
  width?: number;
  height?: number;
  video?: boolean;
}

export interface ThreadsNested {
  author: ThreadsAuthor;
  text: TextRun[];
  media: ThreadsMedia[];
}

/** The Threads layout's input. The relative time and counts arrive formatted. */
export interface ThreadsPost extends ThreadsNested {
  parent?: ThreadsNested;
  quoted?: ThreadsNested;
  card?: {
    domain: string;
    title: string;
    description: string;
    image?: ImageData;
    large: boolean;
  };
  /** As the post header shows it: `18h`, `3d`, `11/18/26`. */
  time: string;
  /** Every action button in order; an empty `value` draws the icon alone. */
  metrics: { icon: string; value: string }[];
}

export interface BlueskyAuthor {
  name: string;
  /** With the leading `@`. */
  handle: string;
  verified?: boolean;
  avatar?: ImageData;
}

export interface BlueskyPicture {
  src?: ImageData;
  width?: number;
  height?: number;
  duration?: string;
}

export interface BlueskyMedia {
  images: BlueskyPicture[];
  video?: BlueskyPicture;
}

export interface BlueskyCard {
  title: string;
  description: string;
  domain: string;
  image?: ImageData;
}

/** The Bluesky layout's input. Dates, counts and facets arrive formatted. */
export interface BlueskyPost {
  author: BlueskyAuthor;
  text: TextRun[];
  emojiOnly?: boolean;
  media: BlueskyMedia;
  card?: BlueskyCard;
  quote?: {
    author: BlueskyAuthor;
    time: string;
    text: string;
    media: BlueskyMedia;
    card?: BlueskyCard;
  };
  date: string;
  stats: { value: string; label: string }[];
  controls: { replies: string; reposts: string; likes: string };
}

export interface RenderOptions {
  theme?: "light" | "dark";
  width?: number;
  dpr?: number;
  /** xeet surface for X posts; other sources ignore it. */
  surface?: "web-timeline" | "web-detail" | "ios-timeline" | "ios-detail";
  /** X posts only: show the whole body instead of cutting it at "Show more". */
  expanded?: boolean;
}

export interface RenderedPost {
  png: Buffer;
  width: number;
  height: number;
  warnings: string[];
}

export interface PostBySource {
  twitter: XPost;
  bluesky: BlueskyPost;
  threads: ThreadsPost;
}

export interface PostRenderer {
  render<S extends RenderSource>(
    source: S,
    post: PostBySource[S],
    options?: RenderOptions,
  ): Promise<RenderedPost>;
  dispose(): void;
}

export interface PostRendererConfig {
  /** `pond-render.wasm`. */
  wasmPath: string;
  /** Folder of the bundled open-licensed fonts (Inter, Noto, STIX). */
  fontsDir: string;
  /** Where the slimmed Apple Color Emoji is kept between launches. */
  cacheDir?: string;
}

interface HostFace {
  file: string;
  pack: string;
  family: string;
  stack: string | null;
}

interface Exports {
  [name: string]: WebAssembly.ExportValue;
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  dealloc(ptr: number, len: number): void;
  out_ptr(): number;
  out_len(): number;
  register_font(
    name: number,
    nameLen: number,
    data: number,
    dataLen: number,
    index: number,
  ): number;
  host_faces(): number;
  missing_packs(ptr: number, len: number): number;
  render_post(ptr: number, len: number): number;
}

/** Packs `missing_packs` asks for by script; every other pack is registered up front. */
const SCRIPT_PACKS = new Set([
  "emoji",
  "cjk",
  "arabic",
  "hebrew",
  "latin",
  "math",
]);

const SYSTEM = "/System/Library/Fonts";
const EMOJI_TTC = `${SYSTEM}/Apple Color Emoji.ttc`;

interface MacFace {
  path: string;
  index?: number;
  /** A script fallback; without it those characters draw as boxes, so a Mac that lacks it still renders. */
  optional?: boolean;
}

/** macOS files for the faces xeet ships but Pond may not redistribute. */
const MAC_FACES = new Map<string, MacFace>([
  ["Arial.ttf", { path: `${SYSTEM}/Supplemental/Arial.ttf` }],
  ["Arial-Bold.ttf", { path: `${SYSTEM}/Supplemental/Arial Bold.ttf` }],
  ["HiraginoSans-Regular.otf", { path: `${SYSTEM}/ヒラギノ角ゴシック W3.ttc` }],
  ["HiraginoSans-Bold.otf", { path: `${SYSTEM}/ヒラギノ角ゴシック W6.ttc` }],
  ["SFNS.ttf", { path: `${SYSTEM}/SFNS.ttf` }],
  [
    "NotoSansOriya.ttf",
    { path: `${SYSTEM}/NotoSansOriya.ttc`, index: 0, optional: true },
  ],
  [
    "NotoSansKannada.ttf",
    { path: `${SYSTEM}/NotoSansKannada.ttc`, index: 3, optional: true },
  ],
  [
    "Thonburi.ttf",
    { path: `${SYSTEM}/ThonburiUI.ttc`, index: 0, optional: true },
  ],
  [
    "KohinoorDevanagari.ttf",
    { path: `${SYSTEM}/Kohinoor.ttc`, index: 0, optional: true },
  ],
  [
    "KohinoorBangla.ttf",
    { path: `${SYSTEM}/KohinoorBangla.ttc`, index: 0, optional: true },
  ],
]);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Clipped text can end mid-surrogate pair; JSON.stringify escapes only lone halves, and serde rejects them. */
const LONE_SURROGATE_ESCAPE = /(?<!\\)((?:\\\\)*)\\ud[89a-f][0-9a-f]{2}/gi;

export async function createPostRenderer(
  config: PostRendererConfig,
): Promise<PostRenderer> {
  const module = await WebAssembly.compile(await readFile(config.wasmPath));
  const instance = await WebAssembly.instantiate(module, {});
  /** SAFETY: `pond-render.wasm` is built from packages/render/crates and exports exactly these symbols. */
  const wasm = instance.exports as Exports;
  const registered = new Set<string>();

  const output = (): Uint8Array =>
    new Uint8Array(wasm.memory.buffer, wasm.out_ptr(), wasm.out_len()).slice();

  const call = (
    fn: (ptr: number, len: number) => number,
    bytes: Uint8Array,
  ): Uint8Array => {
    const ptr = wasm.alloc(bytes.length);
    new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
    const status = fn(ptr, bytes.length);
    wasm.dealloc(ptr, bytes.length);
    const out = output();
    if (status !== 0) throw new Error(decoder.decode(out));
    return out;
  };

  const register = (file: string, data: Uint8Array, index: number) => {
    const name = encoder.encode(file);
    const namePtr = wasm.alloc(name.length);
    new Uint8Array(wasm.memory.buffer, namePtr, name.length).set(name);
    const dataPtr = wasm.alloc(data.length);
    new Uint8Array(wasm.memory.buffer, dataPtr, data.length).set(data);
    const status = wasm.register_font(
      namePtr,
      name.length,
      dataPtr,
      data.length,
      index,
    );
    wasm.dealloc(namePtr, name.length);
    if (status !== 0) throw new Error(decoder.decode(output()));
    registered.add(file);
  };

  wasm.host_faces();
  /** SAFETY: `host_faces` writes a JSON array of `HostFace` records from the same wasm build. */
  const faces = JSON.parse(decoder.decode(output())) as HostFace[];

  const loadFace = async (face: HostFace) => {
    if (registered.has(face.file)) return;
    if (face.pack === "emoji") {
      register(face.file, await emojiFont(config.cacheDir), 0);
      return;
    }
    const bundled = join(config.fontsDir, face.file);
    const source = MAC_FACES.get(face.file) ?? { path: bundled };
    if (!existsSync(source.path)) {
      if (source.optional) return;
      throw new Error(`Font ${face.file} not found at ${source.path}`);
    }
    register(face.file, await readFile(source.path), source.index ?? 0);
  };

  /** A variable file backs one face per weight; read and register it once. */
  const loadPacks = async (packs: Iterable<string>) => {
    const wanted = new Set(packs);
    const byFile = new Map(
      faces.filter((f) => wanted.has(f.pack)).map((f) => [f.file, f]),
    );
    await Promise.all([...byFile.values()].map(loadFace));
  };

  await loadPacks(
    faces.map((f) => f.pack).filter((pack) => !SCRIPT_PACKS.has(pack)),
  );

  let disposed = false;
  return {
    async render(source, post, options = {}) {
      if (disposed) throw new Error("Post renderer was disposed");
      const request = encoder.encode(
        JSON.stringify({ source, post, options }).replace(
          LONE_SURROGATE_ESCAPE,
          "$1\\ufffd",
        ),
      );
      /** SAFETY: `missing_packs` writes a JSON array of pack names. */
      const missing = JSON.parse(
        decoder.decode(call(wasm.missing_packs, request)),
      ) as string[];
      if (missing.length > 0) await loadPacks(missing);
      const out = call(wasm.render_post, request);
      const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
      const headerLen = view.getUint32(0, true);
      /** SAFETY: `render_post` prefixes the PNG with a JSON header holding width, height and warnings. */
      const header = JSON.parse(
        decoder.decode(out.subarray(4, 4 + headerLen)),
      ) as Omit<RenderedPost, "png">;
      return { ...header, png: Buffer.from(out.subarray(4 + headerLen)) };
    },
    dispose() {
      disposed = true;
    },
  };
}

async function emojiFont(cacheDir: string | undefined): Promise<Uint8Array> {
  const info = await stat(EMOJI_TTC);
  const key = createHash("sha1")
    .update(`${info.size}:${info.mtimeMs}`)
    .digest("hex")
    .slice(0, 12);
  const cached = cacheDir
    ? join(cacheDir, `AppleColorEmoji-64-${key}.ttf`)
    : undefined;
  if (cached && existsSync(cached)) return readFile(cached);
  const font = extractEmojiStrike(await readFile(EMOJI_TTC));
  if (cached && cacheDir) {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(cached, font);
  }
  return font;
}
