import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { eventTables, libraryTables } from "../database/tables";
import { initializePondSchema } from "../db";
import {
  hydrateOrganizationBundle,
  writeOrganizationBundle,
} from "./organization-bundle";

function available() {
  try {
    const db = new Database(":memory:");
    db.close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}
const roots: Array<string> = [];
const dbs: Array<Database.Database> = [];
afterEach(() => {
  for (const db of dbs.splice(0)) {
    db.close();
  }
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});
function db() {
  const raw = new Database(":memory:");
  dbs.push(raw);
  initializePondSchema(raw, () => false);
  return Object.assign(
    drizzle(raw, { schema: { ...libraryTables, ...eventTables } }),
    {
      $raw: raw,
    },
  );
}
describe.skipIf(!available())("portable organization", () => {
  it("restores folders, nested smart groups and saved presentation into a fresh index", () => {
    const root = mkdtempSync(join(tmpdir(), "pond-organization-"));
    roots.push(root);
    const source = db();
    source.$raw.exec(
      "insert into folders(id,parent_id,name,sort_order) values ('parent',null,'Project',2),('child','parent','References',5); insert into folder_metadata(folder_id,description,external_link) values ('parent','Current project','https://example.com/project'); insert into saved_views(id,name,kind,parent_id,query,layout) values ('group','Blue','group',null,'{\"combinator\":\"and\",\"not\":true,\"rules\":[]}',null),('view','Grid','saved_view','group','{\"combinator\":\"or\",\"rules\":[]}','grid')",
    );
    writeOrganizationBundle(source, root);
    const fresh = db();
    hydrateOrganizationBundle(fresh, root);
    expect(
      fresh.$raw.prepare("select * from folders order by id").all(),
    ).toEqual(source.$raw.prepare("select * from folders order by id").all());
    expect(
      fresh.$raw.prepare("select * from saved_views order by id").all(),
    ).toEqual(
      source.$raw.prepare("select * from saved_views order by id").all(),
    );
    expect(
      fresh.$raw
        .prepare("select * from folder_metadata order by folder_id")
        .all(),
    ).toEqual(
      source.$raw
        .prepare("select * from folder_metadata order by folder_id")
        .all(),
    );
  });
  it("removes organization deleted in the portable bundle when reopening an existing index", () => {
    const root = mkdtempSync(join(tmpdir(), "pond-organization-"));
    roots.push(root);
    const source = db();
    writeOrganizationBundle(source, root);
    source.$raw.exec("insert into folders(id,name) values('stale','Stale')");
    hydrateOrganizationBundle(source, root);
    expect(source.$raw.prepare("select id from folders").all()).toEqual([]);
  });
});
