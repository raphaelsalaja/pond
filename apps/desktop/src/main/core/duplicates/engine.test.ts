import { describe, expect, it } from "vitest";
import {
  describeDuplicate,
  describeDuplicateGroup,
} from "../../../shared/duplicate-contracts";
import type { DuplicateGroup } from "../../../shared/duplicate-contracts";
import { encodeImagePrint } from "../../lib/fingerprint/image-print";
import { matchLibrary } from "./engine";
import type { ClassifyUrl } from "./matchers/source";
import type { AssetMedia, LibraryAsset, LibrarySave } from "./types";

const sha = (seed: string) => seed.padEnd(64, "0");

function asset(
  saveId: string,
  seed: string,
  options: { path?: string; kind?: string; media?: AssetMedia } = {},
): LibraryAsset {
  return {
    saveId,
    path: options.path ?? `${seed}.png`,
    kind: options.kind ?? "image",
    size: 1,
    sha256: sha(seed),
    media: options.media ?? "image",
  };
}

function save(
  id: string,
  seeds: ReadonlyArray<string>,
  extra: Partial<LibrarySave> = {},
): LibrarySave {
  return {
    id,
    source: "local",
    sourceId: "",
    url: "",
    captureUrl: null,
    splitSourceId: null,
    assets: seeds.map((seed, index) =>
      asset(id, seed, { path: `${index}-${seed}.png` }),
    ),
    clip: null,
    ...extra,
  };
}

const noUrls: ClassifyUrl = () => null;

function single(relation: DuplicateGroup["relation"], ids: Array<string>) {
  return [{ relation, ids, pairs: [0] }];
}

describe("exact matching", () => {
  it("pairs Saves holding the same originals in any order", () => {
    const { groups, pairs } = matchLibrary(
      [save("one", ["a", "b"]), save("two", ["b", "a"])],
      { classifyUrl: noUrls },
    );
    expect(groups).toEqual(single("exact", ["one", "two"]));
    expect(pairs[0]?.saveEvidence).toEqual([{ matcher: "manifest", files: 2 }]);
    expect(pairs[0]?.coverage).toEqual({
      left: 2,
      leftTotal: 2,
      right: 2,
      rightTotal: 2,
    });
    expect(pairs.map(describeDuplicate)[0]).toBe("Same Files");
  });

  it("matches each file once, so repeated hashes need repeated copies", () => {
    const { pairs } = matchLibrary(
      [save("one", ["a", "a"]), save("two", ["a"])],
      { classifyUrl: noUrls },
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.relation).toBe("overlap");
    expect(pairs[0]?.coverage).toEqual({
      left: 1,
      leftTotal: 2,
      right: 1,
      rightTotal: 1,
    });
  });

  it("reports shared files as overlap that can't be merged", () => {
    const { groups, pairs } = matchLibrary(
      [save("one", ["a", "b"]), save("two", ["a", "c"])],
      { classifyUrl: noUrls },
    );
    expect(groups).toEqual(single("overlap", ["one", "two"]));
    expect(pairs.map(describeDuplicate)[0]).toBe("Shares 1 File");
  });

  it("needs a valid hash on every file to match the manifest", () => {
    const broken = save("two", ["a"]);
    broken.assets.push({
      ...asset("two", "f", { path: "unhashed.png" }),
      sha256: "",
    });
    const { pairs } = matchLibrary([save("one", ["a"]), broken], {
      classifyUrl: noUrls,
    });
    expect(pairs[0]?.relation).toBe("overlap");
  });

  it("caps pairs for a hash shared by many Saves", () => {
    const many = Array.from({ length: 100 }, (_, index) =>
      save(`s${String(index).padStart(3, "0")}`, ["bb"]),
    );
    const { pairs, groups } = matchLibrary(many, { classifyUrl: noUrls });
    expect(pairs.length).toBe((64 * 63) / 2 + 36);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.ids).toHaveLength(100);
  });
});

const classify: ClassifyUrl = (url) =>
  url.includes("/status/42") ? { source: "twitter", sourceId: "42" } : null;

const piece = (sourceId: string) => ({
  source: "twitter" as const,
  sourceId,
  url: "https://x.com/u/status/42",
  splitSourceId: "42",
});

describe("source identity", () => {
  it("pairs a capture with a link Save of the same post", () => {
    const { groups, pairs } = matchLibrary(
      [
        save("capture", ["a"], { source: "twitter", sourceId: "42" }),
        save("link", [], {
          source: "web",
          sourceId: "page",
          url: "https://x.com/u/status/42",
        }),
      ],
      { classifyUrl: classify },
    );
    expect(groups[0]).toMatchObject({
      relation: "exact",
      ids: ["capture", "link"],
    });
    expect(pairs.map(describeDuplicate)[0]).toBe("Same Post");
  });

  it("never pairs split pieces through the post URL they share", () => {
    const { pairs } = matchLibrary(
      [
        save("first", ["a"], piece("42:1")),
        save("second", ["b"], piece("42:2")),
      ],
      { classifyUrl: classify },
    );
    expect(pairs).toEqual([]);
  });
});

const vector = (lead: number) => {
  const values = Array.from({ length: 4 }, () => 0);
  values[0] = lead;
  return values;
};

describe("semantic evidence", () => {
  it("keeps the nearest current-model pair and labels it related", () => {
    const saves = [
      save("alpha", ["a"], { clip: vector(1) }),
      save("bravo", ["b"], { clip: vector(0.9) }),
      save("charlie", ["c"], { clip: vector(0.1) }),
    ];
    const { groups, pairs } = matchLibrary(saves, {
      classifyUrl: noUrls,
      semantic: {
        model: "current",
        store: {
          neighbors: (values) => {
            if (values[0] === 1) {
              return [
                { id: "alpha", distance: 0 },
                { id: "bravo", distance: 0.03 },
                { id: "charlie", distance: 0.5 },
              ];
            }
            if (values[0] === 0.9) {
              return [
                { id: "alpha", distance: 0.02 },
                { id: "gone", distance: 0 },
              ];
            }
            return [];
          },
        },
      },
    });
    expect(groups).toEqual(single("related", ["alpha", "bravo"]));
    expect(pairs[0]?.saveEvidence).toEqual([
      { matcher: "semantic", model: "current", distance: 0.02 },
    ]);
    expect(pairs.map(describeDuplicate)[0]).toBe("Similar Content");
  });

  it("does not add a related group over an exact one", () => {
    const { groups } = matchLibrary(
      [
        save("one", ["a"], { clip: vector(1) }),
        save("two", ["a"], { clip: vector(1) }),
      ],
      {
        classifyUrl: noUrls,
        semantic: {
          model: "current",
          store: {
            neighbors: () => [
              { id: "one", distance: 0 },
              { id: "two", distance: 0 },
            ],
          },
        },
      },
    );
    expect(groups.map((group) => group.relation)).toEqual(["exact"]);
  });
});

const print = (full: bigint, center: bigint) =>
  encodeImagePrint({ full, center });
const near = (id: string, seed: string) => save(id, [seed]);

describe("near grouping", () => {
  it("only admits Saves that match every member", () => {
    const base = 0x0f_0f_0f_0f_0f_0f_0f_0fn;
    const fingerprints = {
      image: new Map([
        [sha("a"), print(base, base)],
        [sha("b"), print(base ^ 0b111n, base)],
        [
          sha("c"),
          print(base ^ 0b1111_1000n, ~base & 0xff_ff_ff_ff_ff_ff_ff_ffn),
        ],
      ]),
      video: new Map(),
      audio: new Map(),
    };
    const { groups } = matchLibrary(
      [near("one", "a"), near("two", "b"), near("three", "c")],
      { classifyUrl: noUrls, fingerprints },
    );
    expect(groups.map((group) => [group.relation, group.ids])).toEqual([
      ["near", ["one", "three"]],
      ["near", ["one", "two"]],
    ]);
  });

  it("folds exact copies into the near group they belong to", () => {
    const base = 0x00_ff_00_ff_00_ff_00_ffn;
    const fingerprints = {
      image: new Map([
        [sha("a"), print(base, base)],
        [sha("b"), print(base ^ 0b11n, base)],
      ]),
      video: new Map(),
      audio: new Map(),
    };
    const { groups, pairs } = matchLibrary(
      [near("one", "a"), near("copy", "a"), near("resized", "b")],
      { classifyUrl: noUrls, fingerprints },
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      relation: "near",
      ids: ["copy", "one", "resized"],
    });
    expect(groups.map((group) => describeDuplicateGroup(group, pairs))[0]).toBe(
      "Same Image, Resized",
    );
  });
});

describe("dismissals and scope", () => {
  it("hides a dismissed pair until the relation gets stronger", () => {
    const saves = [save("one", ["a", "b"]), save("two", ["a", "c"])];
    expect(
      matchLibrary(saves, {
        classifyUrl: noUrls,
        dismissed: [{ ids: ["two", "one"], relation: "overlap" }],
      }).groups,
    ).toEqual([]);
    expect(
      matchLibrary([save("one", ["a"]), save("two", ["a"])], {
        classifyUrl: noUrls,
        dismissed: [{ ids: ["one", "two"], relation: "overlap" }],
      }).groups.map((group) => group.relation),
    ).toEqual(["exact"]);
  });

  it("keeps only groups touching the scope and renumbers their pairs", () => {
    const { groups, pairs } = matchLibrary(
      [
        save("a1", ["a"]),
        save("a2", ["a"]),
        save("b1", ["b"]),
        save("b2", ["b"]),
      ],
      { classifyUrl: noUrls, scope: new Set(["b2"]) },
    );
    expect(groups).toEqual(single("exact", ["b1", "b2"]));
    expect(pairs.map((pair) => pair.ids)).toEqual([["b1", "b2"]]);
  });
});
