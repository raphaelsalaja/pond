import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { syncBaselineWhere } from "./sync-baseline";

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
  it("omits trashed source ids so a re-sync can recapture them", () => {
    expect(syncBaselineWhere.toString()).toMatch(/deletedAt/);
    void syncBaselineWhere({ id: "acc", source: "threads" });
  });
});
