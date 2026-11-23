import { describe, expect, it } from "vitest";
import { encodeImagePrint } from "../../lib/fingerprint/image-print";
import { matchLibrary } from "./engine";
import {
  type FingerprintSets,
  type LibraryAsset,
  type LibrarySave,
  MAX_FANOUT,
} from "./types";

const LIBRARY = 20_000;
const COPIES = 200;
const RESIZES = 200;
const ICON_OWNERS = 300;

function random(seed: number) {
  let state = seed;
  const word = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return BigInt(state);
  };
  return () => (word() << 32n) | word();
}

function buildLibrary() {
  const next = random(11);
  const image = new Map<string, Uint8Array>();
  const saves: LibrarySave[] = [];
  let files = 0;

  const imageAsset = (saveId: string, sha256: string): LibraryAsset => ({
    saveId,
    path: `${sha256.slice(-8)}.png`,
    kind: "image",
    size: 1,
    sha256,
    media: "image",
  });
  const save = (id: string, assets: LibraryAsset[]): LibrarySave => ({
    id,
    source: "local",
    sourceId: "",
    url: "",
    captureUrl: null,
    splitSourceId: null,
    clip: null,
    assets,
  });
  const file = (saveId: string, print = { full: next(), center: next() }) => {
    const sha256 = (files++).toString(16).padStart(64, "0");
    image.set(sha256, encodeImagePrint(print));
    return { sha256, print, asset: imageAsset(saveId, sha256) };
  };

  for (let index = 0; index < LIBRARY; index++) {
    const id = `save-${index}`;
    const count = 1 + (index % 4);
    saves.push(
      save(
        id,
        Array.from({ length: count }, () => file(id).asset),
      ),
    );
  }

  for (let index = 0; index < COPIES; index++) {
    const base = saves[index * 7];
    if (!base) throw new Error(`No save-${index * 7}`);
    const id = `copy-${index}`;
    saves.push(
      save(
        id,
        [...base.assets].reverse().map((asset) => imageAsset(id, asset.sha256)),
      ),
    );
  }

  for (let index = 0; index < RESIZES; index++) {
    const photo = file(`photo-${index}`);
    const resized = file(`resized-${index}`, {
      full: photo.print.full ^ 0b101n,
      center: photo.print.center ^ 0b1n,
    });
    saves.push(save(`photo-${index}`, [photo.asset]));
    saves.push(save(`resized-${index}`, [resized.asset]));
  }

  const icon = file("icon");
  for (let index = 0; index < ICON_OWNERS; index++) {
    const id = `icon-${index}`;
    saves.push(save(id, [imageAsset(id, icon.sha256), file(id).asset]));
  }

  const fingerprints: FingerprintSets = {
    image,
    video: new Map(),
    audio: new Map(),
  };
  return { saves, fingerprints };
}

describe("a large Library", () => {
  const library = buildLibrary();

  it("finds every planted duplicate in a bounded time", () => {
    const started = performance.now();
    const { pairs, groups } = matchLibrary(library.saves, {
      classifyUrl: () => null,
      fingerprints: library.fingerprints,
    });
    const elapsed = performance.now() - started;

    const counts = new Map<string, number>();
    for (const pair of pairs)
      counts.set(pair.relation, (counts.get(pair.relation) ?? 0) + 1);
    const fanout =
      (MAX_FANOUT * (MAX_FANOUT - 1)) / 2 + (ICON_OWNERS - MAX_FANOUT);
    expect(Object.fromEntries(counts)).toEqual({
      exact: COPIES,
      near: RESIZES,
      overlap: fanout,
    });

    const merged = groups.filter(
      (group) => group.relation === "exact" || group.relation === "near",
    );
    expect(merged).toHaveLength(COPIES + RESIZES);
    for (const group of merged) expect(group.ids).toHaveLength(2);
    expect(
      merged.some(
        (group) =>
          group.relation === "exact" &&
          group.ids.includes("copy-0") &&
          group.ids.includes("save-0"),
      ),
    ).toBe(true);
    expect(
      merged.some(
        (group) =>
          group.relation === "near" &&
          group.ids.includes("photo-0") &&
          group.ids.includes("resized-0"),
      ),
    ).toBe(true);

    expect(elapsed).toBeLessThan(10_000);
  }, 60_000);

  it("returns only the groups a scoped scan touches", () => {
    const { groups } = matchLibrary(library.saves, {
      classifyUrl: () => null,
      fingerprints: library.fingerprints,
      scope: new Set(["copy-3", "resized-9"]),
    });
    expect(groups.map((group) => [group.relation, group.ids])).toEqual([
      ["exact", ["copy-3", "save-21"]],
      ["near", ["photo-9", "resized-9"]],
    ]);
  }, 60_000);
});
