/**
 * Spike (plan 009): checks the Rust port in `packages/core` against this
 * engine and the fingerprint code, then times both. Opt-in, because the native
 * module is built separately:
 *
 *   node packages/core/scripts/build.mjs
 *   POND_NATIVE_CORE=1 pnpm --filter @pond/desktop exec vitest run src/main/core/duplicates/native-engine.test.ts
 */
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import type { NativeCore } from "../../../../../../packages/core/index";
import { DUPLICATE_RELATIONS } from "../../../shared/duplicate-contracts";
import type { DuplicateDismissal } from "../../../shared/duplicate-contracts";
import {
  audioPrintFromSamples,
  compareAudioPrints,
  decodeAudioPrint,
  encodeAudioPrint,
} from "../../lib/fingerprint/audio-print";
import {
  encodeImagePrint,
  imagePrintFromGray,
} from "../../lib/fingerprint/image-print";
import {
  compareVideoPrints,
  decodeVideoPrint,
  encodeVideoPrint,
  videoPrintFromFrames,
} from "../../lib/fingerprint/video-print";
import { matchLibrary } from "./engine";
import type { MatchOptions, MatchResult } from "./engine";
import { groupPairs } from "./group";
import { semanticMatches } from "./matchers/semantic";
import type { NeighborStore } from "./matchers/semantic";
import type {
  AssetMedia,
  FingerprintSets,
  LibraryAsset,
  LibrarySave,
} from "./types";

const enabled = process.env.POND_NATIVE_CORE === "1";
const loaded: { nativeCore: NativeCore | null } = enabled
  ? createRequire(import.meta.url)("../../../../../../packages/core/index.cjs")
  : { nativeCore: null };

function core(): NativeCore {
  if (!loaded.nativeCore) {
    throw new Error(
      "Build packages/core first: node packages/core/scripts/build.mjs",
    );
  }
  return loaded.nativeCore;
}

/** Mulberry32: a small seeded generator so every run builds the same Library. */
function generator(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  const int = (limit: number) => Math.floor(next() * limit);
  const word = () => int(4_294_967_296) >>> 0;
  const big = () => (BigInt(word()) << 32n) | BigInt(word());
  return { next, int, word, big };
}

type Random = ReturnType<typeof generator>;

function flipBits(value: bigint, flips: number, random: Random): bigint {
  let result = value;
  for (let index = 0; index < flips; index++) {
    result ^= 1n << BigInt(random.int(64));
  }
  return result;
}

const HOP_SECONDS = 128 / 5512;

interface Fixture {
  saves: Array<LibrarySave>;
  options: MatchOptions;
}

/** A Library with copies, resized images, re-encoded video and audio, shared URLs, split Saves, semantic neighbours, dismissals and a scope, all drawn from one seed. */
function randomLibrary(seed: number, size: number, scoped: boolean): Fixture {
  const random = generator(seed);
  const imagePrints = new Map<string, Uint8Array>();
  const videoPrints = new Map<string, Uint8Array>();
  const audioPrints = new Map<string, Uint8Array>();
  const images: Array<{ full: bigint; center: bigint }> = [];
  const videos: Array<Array<bigint>> = [];
  const audios: Array<Uint32Array> = [];
  const shas: Array<{ sha256: string; media: AssetMedia | null }> = [];
  let files = 0;

  const newSha = (media: AssetMedia | null): string => {
    const sha256 = (files++).toString(16).padStart(64, "0");
    if (media === "image") {
      const base =
        images.length && random.next() < 0.3
          ? images[random.int(images.length)]
          : null;
      const print = base
        ? {
            full: flipBits(base.full, random.int(8), random),
            center: flipBits(base.center, random.int(6), random),
          }
        : random.next() < 0.05
          ? { full: 0n, center: random.big() }
          : {
              full: random.big(),
              center: random.next() < 0.1 ? 0n : random.big(),
            };
      images.push(print);
      imagePrints.set(sha256, encodeImagePrint(print));
    } else if (media === "video") {
      const base =
        videos.length && random.next() < 0.35
          ? videos[random.int(videos.length)]
          : null;
      const frames = base
        ? base.map((frame) => flipBits(frame, random.int(4), random))
        : Array.from({ length: 10 + random.int(50) }, () =>
            random.next() < 0.1 ? 0n : random.big(),
          );
      if (base && random.next() < 0.3) frames.unshift(0n);
      videos.push(frames);
      const intervalSeconds = 1;
      videoPrints.set(
        sha256,
        encodeVideoPrint({
          durationSeconds: frames.length * intervalSeconds,
          intervalSeconds,
          frames,
        }),
      );
    } else if (media === "audio") {
      const base =
        audios.length && random.next() < 0.35
          ? audios[random.int(audios.length)]
          : null;
      const frames = base
        ? base.map((frame) =>
            random.next() < 0.3 ? (frame ^ (1 << random.int(32))) >>> 0 : frame,
          )
        : Uint32Array.from({ length: 300 + random.int(1200) }, () =>
            random.word(),
          );
      audios.push(frames);
      audioPrints.set(
        sha256,
        encodeAudioPrint({
          durationSeconds: frames.length * HOP_SECONDS,
          hopSeconds: HOP_SECONDS,
          frames,
        }),
      );
    }
    shas.push({ sha256, media });
    return sha256;
  };

  const MEDIA: Array<AssetMedia | null> = [
    "image",
    "image",
    "image",
    "video",
    "audio",
    null,
  ];
  const SOURCES = ["local", "web", "twitter", "instagram"] as const;
  const saves: Array<LibrarySave> = [];
  for (let index = 0; index < size; index++) {
    const id = `01J${index.toString(36).toUpperCase().padStart(8, "0")}`;
    const source = SOURCES[random.int(SOURCES.length)] ?? "local";
    const count = random.int(4);
    const assets: Array<LibraryAsset> = [];
    for (let file = 0; file < count; file++) {
      const reuse = shas.length > 0 && random.next() < 0.2;
      const picked = reuse ? shas[random.int(shas.length)] : null;
      const media = picked
        ? picked.media
        : (MEDIA[random.int(MEDIA.length)] ?? null);
      const sha256 = picked
        ? picked.sha256
        : random.next() < 0.02
          ? "not-a-hash"
          : newSha(media);
      assets.push({
        saveId: id,
        path: `${sha256.slice(-6)}-${file}.bin`,
        kind: media ?? "file",
        size: random.int(10_000),
        sha256,
        media,
      });
    }
    const page = random.int(Math.max(4, size / 6));
    saves.push({
      id,
      source,
      sourceId:
        source === "local"
          ? ""
          : `${source}-${random.int(Math.max(4, size / 5))}`,
      url: source === "local" ? "" : `https://example.com/${page}`,
      captureUrl:
        random.next() < 0.3 ? `https://x.com/post/${random.int(size)}` : null,
      splitSourceId: random.next() < 0.1 ? "post" : null,
      clip: random.next() < 0.6 ? [index] : null,
      assets,
    });
  }

  const neighbors = new Map<number, Array<{ id: string; distance: number }>>();
  const store: NeighborStore = {
    neighbors: (vector, limit) => {
      const key = vector[0] ?? 0;
      let list = neighbors.get(key);
      if (!list) {
        list = Array.from({ length: limit }, () => ({
          id: saves[random.int(saves.length)]?.id ?? "",
          distance: random.next() * 0.06 - 0.005,
        }));
        neighbors.set(key, list);
      }
      return list;
    },
  };

  const RELATIONS = ["exact", "near", "overlap", "related"] as const;
  const dismissed: Array<DuplicateDismissal> = Array.from(
    { length: Math.floor(size / 20) },
    () => ({
      ids: [
        saves[random.int(size)]?.id ?? "",
        saves[random.int(size)]?.id ?? "",
      ],
      relation: RELATIONS[random.int(RELATIONS.length)] ?? "related",
    }),
  );
  const scope = scoped
    ? new Set(
        Array.from(
          { length: Math.ceil(size / 10) },
          () => saves[random.int(size)]?.id ?? "",
        ),
      )
    : undefined;

  return {
    saves,
    options: {
      classifyUrl: (url) => {
        const post = /^https:\/\/x\.com\/post\/(\d+)$/.exec(url);
        if (post?.[1])
          return { source: "twitter", sourceId: `twitter-${post[1]}` };
        return url.startsWith("https://example.com/")
          ? { source: "web", sourceId: url }
          : null;
      },
      fingerprints: {
        image: imagePrints,
        video: videoPrints,
        audio: audioPrints,
      } satisfies FingerprintSets,
      semantic: { model: "clip-test", store },
      scope,
      dismissed,
    },
  };
}

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const encodeSet = (prints: ReadonlyMap<string, Uint8Array>) =>
  Object.fromEntries(
    [...prints].map(([sha256, value]) => [sha256, base64(value)]),
  );

/** What the native engine needs from JavaScript: URL identities from the TypeScript classifier and semantic neighbours from `sqlite-vec`. */
function nativeInput(
  saves: ReadonlyArray<LibrarySave>,
  options: MatchOptions,
): string {
  return JSON.stringify({
    saves: saves.map((save) => ({
      id: save.id,
      source: save.source,
      sourceId: save.sourceId,
      assets: save.assets,
      urlIdentities: save.splitSourceId
        ? []
        : [...new Set([save.url, save.captureUrl])].flatMap((url) => {
            if (!url || !/^https?:\/\//i.test(url)) return [];
            const identity = options.classifyUrl(url);
            return identity ? [identity] : [];
          }),
    })),
    fingerprints: options.fingerprints && {
      image: encodeSet(options.fingerprints.image),
      video: encodeSet(options.fingerprints.video),
      audio: encodeSet(options.fingerprints.audio),
    },
    extraFound: options.semantic
      ? semanticMatches(saves, options.semantic.store, {
          model: options.semantic.model,
          scope: options.scope,
        }).map((found) => ({ ids: found.ids, save: found.save }))
      : [],
    scope: options.scope ? [...options.scope] : undefined,
    dismissed: options.dismissed ?? [],
  });
}

function percentile(values: Array<number>, rank: number): number {
  const sorted = values.toSorted((left, right) => left - right);
  return (
    sorted[Math.min(sorted.length - 1, Math.ceil(rank * sorted.length) - 1)] ??
    0
  );
}

function time(run: () => void, repetitions: number) {
  run();
  const values: Array<number> = [];
  for (let index = 0; index < repetitions; index++) {
    const started = performance.now();
    run();
    values.push(performance.now() - started);
  }
  return { p50: percentile(values, 0.5), max: percentile(values, 1) };
}

interface BenchmarkRecord {
  benchmark: string;
  path: string;
  size: number;
  p50: number;
  max: number;
}

function record(entry: BenchmarkRecord): void {
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

const AssetRefSchema = z.object({
  saveId: z.string(),
  path: z.string(),
  kind: z.string(),
  size: z.number(),
  sha256: z.string(),
});

const AssetEvidenceSchema = z.discriminatedUnion("matcher", [
  z.object({
    matcher: z.literal("sha256"),
    left: AssetRefSchema,
    right: AssetRefSchema,
  }),
  z.object({
    matcher: z.literal("image"),
    algorithm: z.string(),
    distance: z.number(),
    left: AssetRefSchema,
    right: AssetRefSchema,
  }),
  z.object({
    matcher: z.literal("video"),
    algorithm: z.string(),
    matchedFrames: z.number(),
    comparedFrames: z.number(),
    offsetSeconds: z.number(),
    left: AssetRefSchema,
    right: AssetRefSchema,
  }),
  z.object({
    matcher: z.literal("audio"),
    algorithm: z.string(),
    bitErrorRate: z.number(),
    offsetSeconds: z.number(),
    left: AssetRefSchema,
    right: AssetRefSchema,
  }),
]);

const SaveEvidenceSchema = z.discriminatedUnion("matcher", [
  z.object({ matcher: z.literal("manifest"), files: z.number() }),
  z.object({
    matcher: z.literal("source"),
    source: z.string(),
    sourceId: z.string(),
  }),
  z.object({ matcher: z.literal("url"), url: z.string() }),
  z.object({
    matcher: z.literal("semantic"),
    model: z.string(),
    distance: z.number(),
  }),
]);

const RelationSchema = z.enum(DUPLICATE_RELATIONS);

/** The native engine's JSON, checked at the boundary as production code would have to. */
const NativeResultSchema = z.object({
  pairs: z.array(
    z.object({
      ids: z.tuple([z.string(), z.string()]),
      relation: RelationSchema,
      saveEvidence: z.array(SaveEvidenceSchema),
      assetEvidence: z.array(AssetEvidenceSchema),
      coverage: z.object({
        left: z.number(),
        leftTotal: z.number(),
        right: z.number(),
        rightTotal: z.number(),
      }),
    }),
  ),
  groups: z.array(
    z.object({
      relation: RelationSchema,
      ids: z.array(z.string()),
      pairs: z.array(z.number()),
    }),
  ),
});

type NativeResult = z.infer<typeof NativeResultSchema>;

const parseResult = (json: string): NativeResult =>
  NativeResultSchema.parse(JSON.parse(json));

function noise(random: Random, length: number): Float32Array {
  const samples = new Float32Array(length);
  const tones = Array.from({ length: 6 }, () => ({
    hz: 200 + random.next() * 1800,
    gain: random.next() * 0.3,
  }));
  for (let index = 0; index < length; index++) {
    let value = (random.next() - 0.5) * 0.2;
    for (const tone of tones)
      value += tone.gain * Math.sin((2 * Math.PI * tone.hz * index) / 5512);
    samples[index] = value;
  }
  return samples;
}

describe.skipIf(!enabled)("native duplicate engine", () => {
  const random40: Array<{
    seed: number;
    expected: MatchResult;
    actual: NativeResult;
  }> = [];
  let largeExpected: MatchResult | null = null;
  let largeActual: NativeResult | null = null;

  /** Synchronous engine runs, too long for a test body's budget. */
  beforeAll(async () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { saves, options } = randomLibrary(seed, 400, seed % 3 === 0);
      random40.push({
        seed,
        expected: matchLibrary(saves, options),
        actual: parseResult(
          core().matchLibraryJson(nativeInput(saves, options)),
        ),
      });
    }

    const { saves, options } = randomLibrary(7, 20_000, false);
    largeExpected = matchLibrary(saves, options);
    largeActual = parseResult(
      await core().matchLibrary(nativeInput(saves, options)),
    );

    const withoutSemantic = { ...options, semantic: undefined };
    const plain = nativeInput(saves, withoutSemantic);
    const size = saves.length;
    record({
      benchmark: "duplicates.match",
      path: "typescript",
      size,
      ...time(() => matchLibrary(saves, withoutSemantic), 2),
    });
    record({
      benchmark: "duplicates.match",
      path: "native, with input and result marshalling",
      size,
      ...time(
        () =>
          parseResult(
            core().matchLibraryJson(nativeInput(saves, withoutSemantic)),
          ),
        2,
      ),
    });
    record({
      benchmark: "duplicates.match",
      path: "native engine only",
      size,
      ...time(() => core().matchLibraryJson(plain), 2),
    });
    const pairs = largeExpected.pairs;
    record({
      benchmark: "duplicates.group",
      path: "typescript groupPairs only",
      size,
      ...time(() => groupPairs(pairs), 2),
    });
  }, 1_800_000);

  it("matches the TypeScript engine on 40 random Libraries", () => {
    for (const { seed, expected, actual } of random40) {
      expect(actual, `seed ${seed}`).toEqual(expected);
    }
  });

  it("matches the TypeScript engine on a 20,000-Save Library", () => {
    expect(largeActual).toEqual(largeExpected);
  });
});

interface AudioRun {
  expected: Uint8Array;
  actual: Uint8Array;
  copy: Uint8Array;
}

describe.skipIf(!enabled)("native fingerprints", () => {
  it("encodes the same image prints", () => {
    const random = generator(3);
    for (const [width, height] of [
      [256, 256],
      [300, 200],
      [97, 61],
      [9, 8],
    ] as const) {
      for (let round = 0; round < 25; round++) {
        const pixels = Uint8Array.from({ length: width * height }, () =>
          random.int(256),
        );
        const expected = encodeImagePrint(
          imagePrintFromGray({ pixels, width, height }),
        );
        expect([...core().imagePrintFromGray(pixels, width, height)]).toEqual([
          ...expected,
        ]);
      }
    }
  });

  it("encodes the same video prints and compares them the same way", () => {
    const random = generator(5);
    for (let round = 0; round < 50; round++) {
      const count = 1 + random.int(180);
      const frames = Array.from({ length: count }, () =>
        Uint8Array.from({ length: 72 }, () => random.int(256)),
      );
      const flat = new Uint8Array(count * 72);
      for (const [index, frame] of frames.entries())
        flat.set(frame, index * 72);
      const expected = encodeVideoPrint(
        videoPrintFromFrames(count * 0.9, 0.9, frames),
      );
      const actual = core().videoPrintFromFrames(count * 0.9, 0.9, flat);
      expect([...actual]).toEqual([...expected]);

      const copy = frames.map((frame) =>
        frame.map((value) => Math.min(255, value + random.int(3))),
      );
      const other = encodeVideoPrint(
        videoPrintFromFrames(count * 0.9, 0.9, copy),
      );
      const left = decodeVideoPrint(expected);
      const right = decodeVideoPrint(other);
      const match = left && right ? compareVideoPrints(left, right) : null;
      expect(core().compareVideoPrints(expected, other)).toEqual(match);
    }
  });

  const audio: AudioRun = {
    expected: new Uint8Array(),
    actual: new Uint8Array(),
    copy: new Uint8Array(),
  };

  /** Two minutes of audio at the print's sample rate, fingerprinted on both paths. */
  beforeAll(() => {
    const samples = noise(generator(9), 5512 * 120);
    audio.expected = encodeAudioPrint(audioPrintFromSamples(samples, 120));
    audio.actual = core().audioPrintFromSamples(samples, 120);
    const shifted = noise(generator(9), 5512 * 120).subarray(300);
    audio.copy = encodeAudioPrint(audioPrintFromSamples(shifted, 120));
    record({
      benchmark: "fingerprint.audio",
      path: "typescript",
      size: 120,
      ...time(() => audioPrintFromSamples(samples, 120), 5),
    });
    record({
      benchmark: "fingerprint.audio",
      path: "native",
      size: 120,
      ...time(() => core().audioPrintFromSamples(samples, 120), 5),
    });
  }, 120_000);

  it("encodes the same audio prints", () => {
    const left = decodeAudioPrint(audio.expected);
    const right = decodeAudioPrint(audio.actual);
    const differing =
      left && right
        ? left.frames.filter((frame, index) => frame !== right.frames[index])
            .length
        : -1;
    expect({ bytes: audio.actual.length, differing }).toEqual({
      bytes: audio.expected.length,
      differing: 0,
    });
  });

  it("compares audio prints the same way", () => {
    const left = decodeAudioPrint(audio.expected);
    const copy = decodeAudioPrint(audio.copy);
    expect(core().compareAudioPrints(audio.expected, audio.copy)).toEqual(
      left && copy ? compareAudioPrints(left, copy) : null,
    );
  });
});
