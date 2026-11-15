import { describe, expect, it } from "vitest";
import { applyNavFilter, descendantFolderIds } from "./nav-filter";

describe("applyNavFilter", () => {
  const folders = [
    {
      id: "root",
      parentId: null,
      name: "Root",
      color: null,
      sortOrder: 0,
      createdAt: new Date(),
    },
    {
      id: "child",
      parentId: "root",
      name: "Child",
      color: null,
      sortOrder: 0,
      createdAt: new Date(),
    },
  ];
  const saves = [
    { id: "a", source: "twitter", tags: ["fun"] },
    { id: "b", source: "local", tags: [] },
  ];

  it("keeps uncategorized saves out of folders", () => {
    const next = applyNavFilter(
      saves,
      { kind: "uncategorized" },
      { a: ["root"] },
      folders,
    );
    expect(next.map((s) => s.id)).toEqual(["b"]);
  });

  it("includes nested folder members", () => {
    expect([...descendantFolderIds("root", folders)].sort()).toEqual([
      "child",
      "root",
    ]);
    const next = applyNavFilter(
      saves,
      { kind: "folder", id: "root" },
      { a: ["child"] },
      folders,
    );
    expect(next.map((s) => s.id)).toEqual(["a"]);
  });
});

it("keeps a split post's Saves and nothing else", () => {
  const split = (id: string, sourceId: string) => ({
    id,
    source: "instagram",
    tags: [],
    rawJson: {
      capture: { id, source: "instagram" as const, url: "", media: [] },
      extractorId: "instagram",
      extractedAt: "2026-11-14T00:00:00.000Z",
      split: { sourceId, media: [0] },
    },
  });
  const saves = [split("a", "DAbC"), split("b", "dabc"), split("c", "DAbC")];
  expect(
    applyNavFilter(
      saves,
      { kind: "post", key: "instagram:DAbC", title: "Studio" },
      {},
      [],
    ).map((save) => save.id),
  ).toEqual(["a", "c"]);
});
