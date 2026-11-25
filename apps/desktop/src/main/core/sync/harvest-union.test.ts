import type { ListKind } from "@pond/schema/db";
import { describe, expect, it } from "vitest";
import {
  defaultListKind,
  mergeEntryListKinds,
  stampListKind,
  unionById,
} from "./harvest-union";

describe("defaultListKind", () => {
  it("labels only entries that carry no list of their own", () => {
    const entries: Array<{ id: string; listKinds?: Array<ListKind> }> = [
      { id: "a" },
      { id: "b", listKinds: ["liked"] },
    ];
    expect(defaultListKind(entries, "saved")).toEqual([
      { id: "a", listKinds: ["saved"] },
      { id: "b", listKinds: ["liked"] },
    ]);
  });
});

describe("unionById", () => {
  it("keeps primary order and appends unseen extras", () => {
    const primary = [{ id: "a" }, { id: "b" }];
    const extra = [{ id: "b" }, { id: "c" }, { id: "a" }];
    expect(unionById(primary, extra, (e) => e.id)).toEqual([
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ]);
  });

  it("returns a copy when extra is empty", () => {
    const primary = [{ id: "a" }];
    const out = unionById(primary, [], (e) => e.id);
    expect(out).toEqual(primary);
    expect(out).not.toBe(primary);
  });

  it("merges list kinds when the same id appears on both lists", () => {
    const primary = stampListKind([{ id: "a" }, { id: "b" }], "saved");
    const extra = stampListKind([{ id: "b" }, { id: "c" }], "liked");
    expect(unionById(primary, extra, (e) => e.id, mergeEntryListKinds)).toEqual(
      [
        { id: "a", listKinds: ["saved"] },
        { id: "b", listKinds: ["liked", "saved"] },
        { id: "c", listKinds: ["liked"] },
      ],
    );
  });
});
