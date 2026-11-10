import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { knownIdsFromRows, syncBaselineWhere } from "./sync-baseline";

describe("syncBaselineWhere", () => {
  it("counts mymind imports under their Account across content Sources", () => {
    const where = syncBaselineWhere({ id: "mymind-account", source: "mymind" });
    if (!where) throw new Error("Expected an Account filter.");
    const query = new SQLiteSyncDialect().sqlToQuery(where);
    expect(query.sql).toContain('"saves"."account_id" = ?');
    expect(query.sql).toContain('"saves"."deleted_at" is null');
    expect(query.sql).not.toContain('"saves"."source"');
    expect(query.params).toEqual(["mymind-account"]);
  });
  it("leaves trashed source ids out of the live baseline", () => {
    expect(syncBaselineWhere.toString()).toMatch(/deletedAt/);
    void syncBaselineWhere({ id: "acc", source: "threads" });
  });
});

describe("knownIdsFromRows", () => {
  it("keeps a split post known through a surviving slide", () => {
    expect(
      knownIdsFromRows([
        { sourceId: "post-2 3f9a1c", postSourceId: "post-2" },
        { sourceId: "post-1", postSourceId: null },
      ]),
    ).toEqual(new Set(["post-2 3f9a1c", "post-2", "post-1"]));
  });
});
