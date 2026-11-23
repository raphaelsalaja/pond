import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  describeDuplicate,
  describeDuplicateGroup,
} from "../../../shared/duplicate-contracts";
import {
  AUDIO_PRINT_SAMPLE_RATE,
  encodeAudioPrint,
} from "../../lib/fingerprint/audio-print";
import {
  compareVideoPrints,
  decodeVideoPrint,
  encodeVideoPrint,
} from "../../lib/fingerprint/video-print";
import { binariesAvailable } from "../refresh/binaries";
import { matchLibrary } from "./engine";
import { computeFingerprint } from "./fingerprint-compute";
import { FINGERPRINT_ALGORITHMS } from "./fingerprints";
import type { AssetMedia, FingerprintSets, LibrarySave } from "./types";

const sha = (seed: string) => seed.padEnd(64, "0");

function media(id: string, seed: string, kind: AssetMedia): LibrarySave {
  return {
    id,
    source: "local",
    sourceId: "",
    url: "",
    captureUrl: null,
    splitSourceId: null,
    clip: null,
    assets: [
      {
        saveId: id,
        path: `${id}.${kind === "audio" ? "m4a" : "mp4"}`,
        kind,
        size: 1,
        sha256: sha(seed),
        media: kind,
      },
    ],
  };
}

function sets(partial: Partial<FingerprintSets>): FingerprintSets {
  return { image: new Map(), video: new Map(), audio: new Map(), ...partial };
}

function frames(seed: number, length: number): bigint[] {
  let state = seed;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return BigInt(state);
  };
  return Array.from({ length }, () => (next() << 32n) | next());
}

function audioFrames(seed: number, length: number): Uint32Array {
  let state = seed;
  return Uint32Array.from({ length }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  });
}

const hopSeconds = 128 / AUDIO_PRINT_SAMPLE_RATE;
const audio = (values: Uint32Array) =>
  encodeAudioPrint({ durationSeconds: 30, hopSeconds, frames: values });

function clip(durationSeconds: number, intervalSeconds: number, of: bigint[]) {
  return encodeVideoPrint({ durationSeconds, intervalSeconds, frames: of });
}

describe("video matching", () => {
  it("groups re-encoded copies and skips other lengths", () => {
    const scene = frames(1, 30);
    const resampled = scene.flatMap((frame) => [frame, frame ^ 1n]);
    const video = new Map([
      [sha("a"), clip(30, 1, scene)],
      [sha("b"), clip(30.5, 0.5, resampled)],
      [sha("c"), clip(90, 1, scene)],
    ]);
    const saves = [
      media("one", "a", "video"),
      media("two", "b", "video"),
      media("three", "c", "video"),
    ];
    const { groups, pairs } = matchLibrary(saves, {
      classifyUrl: () => null,
      fingerprints: sets({ video }),
    });
    expect(groups.map((group) => [group.relation, group.ids])).toEqual([
      ["near", ["one", "two"]],
    ]);
    expect(
      groups.map((group) => describeDuplicateGroup(group, pairs))[0],
    ).toBe("Same Video");
  });
});

describe("audio matching", () => {
  it("pairs audio files with the same recording", () => {
    const track = audioFrames(3, 1200);
    const { groups, pairs } = matchLibrary(
      [media("one", "a", "audio"), media("two", "b", "audio")],
      {
        classifyUrl: () => null,
        fingerprints: sets({
          audio: new Map([
            [sha("a"), audio(track)],
            [
              sha("b"),
              audio(
                track.map((frame, index) => (index % 2 ? frame ^ 1 : frame)),
              ),
            ],
          ]),
        }),
      },
    );
    expect(groups.map((group) => group.relation)).toEqual(["near"]);
    expect(
      groups.map((group) => describeDuplicateGroup(group, pairs))[0],
    ).toBe("Same Audio");
  });

  it("never pairs two videos on a shared soundtrack alone", () => {
    const track = audioFrames(4, 1200);
    const { pairs } = matchLibrary(
      [media("one", "a", "video"), media("two", "b", "video")],
      {
        classifyUrl: () => null,
        fingerprints: sets({
          audio: new Map([
            [sha("a"), audio(track)],
            [sha("b"), audio(track)],
          ]),
        }),
      },
    );
    expect(pairs).toEqual([]);
  });

  it("keeps a matching soundtrack as support for a video match", () => {
    const print = clip(30, 1, frames(5, 30));
    const track = audio(audioFrames(6, 1200));
    const { pairs } = matchLibrary(
      [media("one", "a", "video"), media("two", "b", "video")],
      {
        classifyUrl: () => null,
        fingerprints: sets({
          video: new Map([
            [sha("a"), print],
            [sha("b"), print],
          ]),
          audio: new Map([
            [sha("a"), track],
            [sha("b"), track],
          ]),
        }),
      },
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.assetEvidence.map((item) => item.matcher)).toEqual([
      "video",
      "audio",
    ]);
    expect(pairs.map(describeDuplicate)[0]).toBe("Same Video");
  });
});

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)),
    );
  });
}

const ffmpeg = binariesAvailable().ffmpeg;

describe.skipIf(!ffmpeg)("video fingerprints from real files", () => {
  it("matches a downscaled re-encode and not a different clip", async () => {
    const bin = ffmpeg ?? "ffmpeg";
    const root = await mkdtemp(join(tmpdir(), "pond-video-print-"));
    const quiet = ["-hide_banner", "-loglevel", "error", "-y"];
    const source = (filter: string, out: string) =>
      run(bin, [...quiet, "-f", "lavfi", "-i", filter, "-t", "12", out]);
    try {
      const original = join(root, "original.mp4");
      const smaller = join(root, "smaller.mp4");
      const other = join(root, "other.mp4");
      await source("testsrc2=size=320x240:rate=25", original);
      await run(bin, [
        ...quiet,
        "-i",
        original,
        "-vf",
        "scale=160:120",
        "-b:v",
        "150k",
        smaller,
      ]);
      await source("mandelbrot=size=320x240:rate=25", other);
      const printOf = async (path: string) => {
        const outcome = await computeFingerprint(
          FINGERPRINT_ALGORITHMS.video,
          path,
        );
        expect(outcome.status).toBe("ok");
        const print = outcome.value ? decodeVideoPrint(outcome.value) : null;
        if (!print) throw new Error(`No print for ${path}`);
        return print;
      };
      const [a, b, c] = await Promise.all([
        printOf(original),
        printOf(smaller),
        printOf(other),
      ]);
      expect(compareVideoPrints(a, b)).not.toBeNull();
      expect(compareVideoPrints(a, c)).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);
});
