import { PrefsSchema } from "@pond/schema";
import type {
  AssetRef,
  DuplicatePair,
  DuplicateRelation,
  DuplicateScan,
} from "@shared/duplicate-contracts";
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { normalise } from "@/features/saves";
import { pool } from "@/features/saves/pool";
import { DuplicateReview } from "./";

function row(id: string) {
  return {
    id,
    source: "web" as const,
    sourceId: id,
    url: `https://fixture.test/${id}`,
    title: id,
    files: [],
    tags: [],
  };
}

function file(saveId: string): AssetRef {
  return { saveId, path: "a.png", kind: "image", size: 1, sha256: "a" };
}

function pairOf(relation: DuplicateRelation, left: string, right: string) {
  const pair: DuplicatePair = {
    ids: [left, right],
    relation,
    saveEvidence: [],
    assetEvidence: [],
    coverage: { left: 1, leftTotal: 1, right: 1, rightTotal: 1 },
  };
  if (relation === "exact")
    pair.saveEvidence.push({ matcher: "manifest", files: 1 });
  if (relation === "near")
    pair.assetEvidence.push({
      matcher: "image",
      algorithm: "image-dhash@1",
      distance: 2,
      left: file(left),
      right: file(right),
    });
  if (relation === "overlap") pair.coverage = { ...pair.coverage, leftTotal: 2 };
  if (relation === "related")
    pair.saveEvidence.push({ matcher: "semantic", model: "clip", distance: 0.02 });
  return pair;
}

function scanOf(
  groups: { relation: DuplicateRelation; ids: string[] }[],
  pending = 0,
): DuplicateScan {
  const pairs: DuplicatePair[] = [];
  return {
    groups: groups.map((group) => {
      const positions: number[] = [];
      for (const [offset, left] of group.ids.entries())
        for (const right of group.ids.slice(offset + 1)) {
          positions.push(pairs.length);
          pairs.push(pairOf(group.relation, left, right));
        }
      return { ...group, pairs: positions };
    }),
    pairs,
    index: { assets: 10, fingerprinted: 10 - pending, pending, failed: 0 },
  };
}

function setup(
  groups: { relation: DuplicateRelation; ids: string[] }[],
  pending = 0,
) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(700);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(1200);
  for (const id of groups.flatMap((group) => group.ids)) {
    const save = normalise(row(id));
    if (save) pool.upsert(save);
  }
  const query = vi.fn(async (name: string, input: { ids?: string[] }) => {
    if (name === "saves.findDuplicates") return scanOf(groups, pending);
    if (name === "saves.getMany") return (input.ids ?? []).map(row);
    if (name === "settings.getPrefs") return PrefsSchema.parse({});
    if (name === "saves.dismissDuplicates") return { ok: true, dismissed: 1 };
    return { ok: true, trashed: 1 };
  });
  vi.stubGlobal("pond", { query });
  return query;
}

async function render(element: ReactElement, run: () => Promise<void>) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(element));
    await run();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
}

function byLabel(label: string) {
  const match = document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  if (!match) throw new Error(`Missing ${label}`);
  return match;
}

function primaryButton() {
  return [...document.querySelectorAll("button")].find(
    (button) =>
      button.textContent?.startsWith("Merge") ||
      button.textContent === "Keep Separate",
  );
}

function calls(query: ReturnType<typeof setup>, name: string) {
  return query.mock.calls
    .filter(([called]) => called === name)
    .map(([, input]) => input);
}

it("marks one keeper and merges the rest of the group into it", async () => {
  const query = setup([
    { relation: "exact", ids: ["match-a", "match-b", "match-c"] },
  ]);
  await render(<DuplicateReview saveId="match-a" />, async () => {
    expect(byLabel("Keep match-a").getAttribute("aria-pressed")).toBe("true");
    await act(async () => byLabel("Keep match-b").click());
    expect(
      [...document.querySelectorAll("[aria-pressed=true]")].map((tile) =>
        tile.getAttribute("aria-label"),
      ),
    ).toEqual(["Keep match-b"]);
    expect(document.querySelectorAll("section [role=checkbox]")).toHaveLength(
      1,
    );
    await act(async () => primaryButton()?.click());
    expect(query).toHaveBeenCalledWith("saves.mergeDuplicates", {
      keepId: "match-b",
      ids: ["match-a", "match-b", "match-c"],
    });
    expect(calls(query, "saves.dismissDuplicates")).toEqual([]);
    expect(document.body.textContent).toContain("No duplicates found");
  });
});

it("merges every checked group and keeps unchecked groups separate", async () => {
  const query = setup([
    { relation: "exact", ids: ["one-a", "one-b"] },
    { relation: "exact", ids: ["two-a", "two-b"] },
    { relation: "exact", ids: ["three-a", "three-b"] },
  ]);
  await render(<DuplicateReview saveId={null} />, async () => {
    const groups = document.querySelectorAll<HTMLElement>(
      "section header [role=checkbox]",
    );
    expect(groups).toHaveLength(3);
    await act(async () => groups[1]?.click());
    await act(async () => primaryButton()?.click());
    expect(calls(query, "saves.mergeDuplicates")).toEqual([
      { keepId: "one-a", ids: ["one-a", "one-b"] },
      { keepId: "three-a", ids: ["three-a", "three-b"] },
    ]);
    expect(calls(query, "saves.dismissDuplicates")).toEqual([
      { pairs: [{ ids: ["two-a", "two-b"], relation: "exact" }] },
    ]);
    expect(document.body.textContent).not.toContain("two-b");
    expect(document.body.textContent).not.toContain("three-b");
  });
});

it("keeps a group separate without merging anything", async () => {
  const query = setup([{ relation: "near", ids: ["solo-a", "solo-b"] }]);
  await render(<DuplicateReview saveId={null} />, async () => {
    await act(async () =>
      document.querySelector<HTMLElement>("section [role=checkbox]")?.click(),
    );
    expect(primaryButton()?.textContent).toBe("Keep Separate");
    await act(async () => primaryButton()?.click());
    expect(calls(query, "saves.mergeDuplicates")).toEqual([]);
    expect(calls(query, "saves.dismissDuplicates")).toEqual([
      { pairs: [{ ids: ["solo-a", "solo-b"], relation: "near" }] },
    ]);
  });
});

it("says why each group matched and only merges exact and near groups", async () => {
  setup([
    { relation: "related", ids: ["mix-b", "mix-d"] },
    { relation: "overlap", ids: ["mix-a", "mix-c"] },
    { relation: "near", ids: ["mix-c", "mix-d"] },
    { relation: "exact", ids: ["mix-a", "mix-b"] },
  ]);
  await render(<DuplicateReview saveId={null} />, async () => {
    const headers = [...document.querySelectorAll("section header")].map(
      (header) => header.textContent,
    );
    expect(headers).toEqual([
      "Same File2 Saves",
      "Same Image, Resized2 Saves",
      "Shares 1 File2 Saves",
      "Similar Content2 Saves",
    ]);
    expect(document.querySelectorAll("section [role=checkbox]")).toHaveLength(
      2,
    );
    expect(primaryButton()?.textContent).toBe("Merge (2)");
  });
});

it("asks Pond for groups touching the requested ids", async () => {
  const query = setup([{ relation: "exact", ids: ["keep-a", "keep-b"] }]);
  await render(
    <DuplicateReview saveId={null} ids={["keep-a", "keep-b"]} />,
    async () => {
      expect(query).toHaveBeenCalledWith("saves.findDuplicates", {
        ids: ["keep-a", "keep-b"],
      });
      expect(document.body.textContent).toContain("keep-a");
    },
  );
});

it("shows related content without merge controls", async () => {
  setup([{ relation: "related", ids: ["related-a", "related-b"] }]);
  await render(<DuplicateReview saveId="related-a" />, async () => {
    expect(document.body.textContent).toContain("Similar Content");
    expect(document.querySelectorAll("[aria-pressed]")).toHaveLength(0);
    expect(document.querySelectorAll("[role=checkbox]")).toHaveLength(0);
    expect(primaryButton()).toBeUndefined();
  });
});

it("warns while files are still being fingerprinted", async () => {
  setup([{ relation: "exact", ids: ["index-a", "index-b"] }], 3);
  await render(<DuplicateReview saveId={null} />, async () => {
    expect(document.body.textContent).toContain(
      "Still indexing 3 files. Results may be incomplete.",
    );
  });
});
