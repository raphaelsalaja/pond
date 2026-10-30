import * as schema from "@pond/schema/db";
import * as events from "@pond/schema/events";
import { EMPTY_QUERY } from "@pond/schema/filters";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import type { LibraryQueryRequest } from "../../shared/library-query";
import { recentlyAddedSince } from "../../shared/recently-added";
import { initializePondSchema } from "../db";
import { queryFolderSummaries } from "./folder-summaries";
import { queryLibraryIds, queryLibraryPage } from "./library-query";
import { querySidebarCounts } from "./sidebar-counts";

function nativeAvailable() {
  try {
    const db = new Database(":memory:");
    db.close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}
const opened: Database.Database[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});
function setup() {
  const sqlite = new Database(":memory:");
  opened.push(sqlite);
  initializePondSchema(sqlite, () => false);
  const db = Object.assign(
    drizzle(sqlite, { schema: { ...schema, ...events } }),
    { $raw: sqlite },
  );
  const insert = sqlite.prepare(
    "insert into saves (id, source, source_id, url, title, saved_at, created_at, status, media_type) values (?, 'local', ?, 'pond:test', ?, ?, ?, 'complete', 'text')",
  );
  sqlite.transaction(() => {
    for (let i = 0; i < 1200; i++)
      insert.run(
        String(i).padStart(4, "0"),
        String(i),
        `reference blue sky ${i}`,
        i,
        i,
      );
  })();
  return { db, sqlite };
}

describe.skipIf(!nativeAvailable())("authoritative library query", () => {
  for (const sortKey of ["savedAt", "title", "rating"]) {
    for (const sortDir of ["asc", "desc"] as const) {
      for (const pins of [[], ["0000", "0003", "0004", "1199", "missing"]]) {
        for (const scope of ["all", "folder", "empty"]) {
          it(`differential paging ${sortKey}/${sortDir}/${pins.length}/${scope}`, async () => {
            const { db, sqlite } = setup();
            sqlite.exec(`
              update saves set saved_at = cast(cast(id as integer) / 7 as integer),
                title = 'Title ' || (cast(id as integer) % 9),
                rating = case when cast(id as integer)%3=0 then null else 2 end;
              update saves set deleted_at=1 where id='0003';
              update saves set status='ingesting' where id='0004';
              insert into folders(id,name) values ('subset','Subset');
              insert into save_folders(save_id,folder_id) select id,'subset' from saves where cast(id as integer)%2=0;
            `);
            const request: LibraryQueryRequest = {
              query: EMPTY_QUERY,
              sortKey,
              sortDir,
              limit: 43,
            };
            if (scope !== "all")
              request.scope = {
                folderIds: [scope === "empty" ? "empty" : "subset"],
              };
            const expected = await queryLibraryIds(
              db,
              "library",
              request,
              [],
              pins,
            );
            expect(expected.ids).toHaveLength(
              scope === "all" ? 1198 : scope === "empty" ? 0 : 599,
            );
            let page = await queryLibraryPage(db, "library", request, [], pins);
            const ids = [...page.ids];
            expect(page.total).toBe(expected.ids.length);
            for (let pages = 0; page.nextCursor; pages++) {
              expect(pages).toBeLessThan(30);
              page = await queryLibraryPage(
                db,
                "library",
                { ...request, cursor: page.nextCursor },
                [],
                pins,
              );
              expect(page.total).toBe(expected.ids.length);
              ids.push(...page.ids);
            }
            expect(ids).toEqual(expected.ids);
            expect(new Set(ids).size).toBe(ids.length);
          });
        }
      }
    }
  }

  for (const sortDir of ["asc", "desc"] as const) {
    it(`keeps legacy recency cursors and exact totals after writes: ${sortDir}`, async () => {
      const { db, sqlite } = setup();
      sqlite.exec(
        "update saves set saved_at=cast(cast(id as integer)/10 as integer)",
      );
      const request: LibraryQueryRequest = {
        query: EMPTY_QUERY,
        sortKey: "savedAt",
        sortDir,
        limit: 7,
      };
      const first = await queryLibraryPage(db, "library", request);
      const cursor = {
        value: sortDir === "desc" ? 119 : 0,
        id: sortDir === "desc" ? "1193" : "0003",
        libraryId: "library",
        sortSignature: `savedAt:${sortDir}:pond::[]`,
      };
      expect(first.nextCursor).toEqual(cursor);
      const remainingId = sortDir === "desc" ? "1192" : "0002";
      sqlite
        .prepare("update saves set deleted_at=1 where id=?")
        .run(remainingId);
      sqlite.exec(
        "insert into saves(id,source,source_id,url,saved_at,status) values ('new','local','new','pond:new',50,'complete')",
      );
      const all = await queryLibraryIds(db, "library", request);
      let page = await queryLibraryPage(db, "library", { ...request, cursor });
      const rest = [...page.ids];
      expect(page.total).toBe(1200);
      while (page.nextCursor) {
        page = await queryLibraryPage(db, "library", {
          ...request,
          limit: 127,
          cursor: page.nextCursor,
        });
        expect(page.total).toBe(1200);
        rest.push(...page.ids);
      }
      expect(rest).toEqual(all.ids.slice(all.ids.indexOf(cursor.id) + 1));
      expect(new Set(rest).size).toBe(rest.length);
      await expect(
        queryLibraryPage(db, "library", {
          ...request,
          sortDir: sortDir === "asc" ? "desc" : "asc",
          cursor,
        }),
      ).rejects.toMatchObject({ code: "stale_cursor" });
    });
  }

  it("counts the full library and folder membership beyond the renderer page", () => {
    const { db, sqlite } = setup();
    sqlite.exec(
      "insert into folders(id,name) values ('all','All');insert into save_folders(save_id,folder_id) select id,'all' from saves;update saves set deleted_at=1 where id='0000'",
    );
    expect(querySidebarCounts(db)).toEqual({
      library: 1199,
      uncategorized: 0,
      untagged: 1199,
      recentlyAdded: 0,
      recentlyUsed: 0,
      trash: 1,
      folders: { all: 1199 },
      foldersDownloading: {},
    });
  });
  it("counts distinct saves across each folder subtree", () => {
    const { db, sqlite } = setup();
    sqlite.exec(`
      insert into folders(id,name,parent_id) values
        ('root','Root',null),
        ('child','Child','root'),
        ('leaf','Leaf','child'),
        ('empty','Empty',null);
      insert into save_folders(save_id,folder_id) values
        ('0001','root'),
        ('0002','child'),
        ('0003','root'),
        ('0003','child'),
        ('0004','leaf'),
        ('0005','child');
      update saves set deleted_at=1 where id='0005';
    `);
    expect(querySidebarCounts(db).folders).toEqual({
      root: 4,
      child: 3,
      leaf: 1,
    });
  });
  it("counts recently used saves that are still in the library", () => {
    const { db, sqlite } = setup();
    sqlite.exec("update saves set deleted_at=1 where id='0001'");
    sqlite.exec("update saves set status='ingesting' where id='0002'");
    expect(
      querySidebarCounts(db, [], ["0000", "0001", "0002", "missing"]),
    ).toMatchObject({
      recentlyUsed: 1,
    });
  });
  it("counts and lists saves added in the last week", async () => {
    const { db, sqlite } = setup();
    sqlite.exec(`
      update saves set deleted_at=1 where id='1199';
      update saves set status='ingesting' where id='1198';
    `);
    const week = -recentlyAddedSince(0);
    const now = week + 1195;
    expect(querySidebarCounts(db, [], [], now).recentlyAdded).toBe(3);
    const result = await queryLibraryPage(db, "library", {
      query: EMPTY_QUERY,
      sortKey: "savedAt",
      scope: { savedSince: recentlyAddedSince(now) },
    });
    expect(result.ids).toEqual(["1197", "1196", "1195"]);
  });
  it("summarizes direct child folders and picks the newest visual cover", async () => {
    const { db, sqlite } = setup();
    sqlite.exec(`
      insert into folders(id,name,parent_id,sort_order) values
        ('root','Root',null,0),
        ('first','First','root',0),
        ('second','Second','root',1),
        ('nested','Nested','first',0);
      insert into save_folders(save_id,folder_id) values
        ('0001','first'),
        ('0002','first'),
        ('0003','first'),
        ('0004','first'),
        ('0005','nested'),
        ('0006','first');
      update saves set media_type='image' where id='0001';
      update saves set media_type='video' where id='0002';
      update saves set media_type='image', deleted_at=1 where id='0003';
      update saves set media_type='image', status='ingesting' where id='0004';
      update saves set media_type='image' where id='0005';
    `);

    expect(await queryFolderSummaries(db, "root")).toEqual([
      {
        id: "first",
        directSaveCount: 3,
        downloadingCount: 1,
        childFolderCount: 1,
        previewSaveIds: ["0006", "0005", "0002", "0001"],
      },
      {
        id: "second",
        directSaveCount: 0,
        downloadingCount: 0,
        childFolderCount: 0,
        previewSaveIds: [],
      },
    ]);
  });
  it("applies folder and keyword scope before limiting global hits", async () => {
    const { db, sqlite } = setup();
    sqlite.exec(
      "insert into folders(id,name) values ('older','Older'); insert into save_folders(save_id,folder_id) values ('0001','older')",
    );
    const result = await queryLibraryPage(db, "library", {
      query: EMPTY_QUERY,
      keywords: '"blue sky" -red',
      scope: { folderIds: ["older"] },
      limit: 10,
    });
    expect(result.ids).toEqual(["0001"]);
    expect(result.total).toBe(1);
  });
  it("excludes every ingesting save from library results", async () => {
    const { db, sqlite } = setup();
    sqlite.exec(`
      update saves set status='ingesting', files='[{"path":"partial.jpg"}]' where id='0001';
      update saves set status='ingesting', media_type='link' where id='0002';
      update saves set status='ingesting', media_type='text' where id='0003';
    `);
    const request = {
      query: EMPTY_QUERY,
      scope: { saveIds: ["0000", "0001", "0002", "0003"] },
    };
    expect((await queryLibraryPage(db, "library", request)).ids).toEqual([
      "0000",
    ]);
    expect((await queryLibraryIds(db, "library", request)).ids).toEqual([
      "0000",
    ]);
  });
  it("pages every matching ID with stable ties, nulls last and exact totals", async () => {
    const { db, sqlite } = setup();
    sqlite.exec("update saves set rating=3 where cast(id as integer)%2=0");
    const request = {
      query: EMPTY_QUERY,
      sortKey: "rating",
      sortDir: "asc" as const,
      limit: 127,
    };
    let page = await queryLibraryPage(db, "library", request);
    const ids = [...page.ids];
    while (page.nextCursor) {
      page = await queryLibraryPage(db, "library", {
        ...request,
        cursor: page.nextCursor,
      });
      ids.push(...page.ids);
    }
    expect(new Set(ids).size).toBe(1200);
    expect(ids).toHaveLength(1200);
    expect(page.total).toBe(1200);
    expect(ids.slice(0, 600).every((id) => Number(id) % 2 === 0)).toBe(true);
    expect((await queryLibraryIds(db, "library", request)).ids).toEqual(ids);
  });
  it("rejects a cursor from another library", async () => {
    const { db } = setup();
    const first = await queryLibraryPage(db, "one", {
      query: EMPTY_QUERY,
      limit: 10,
    });
    await expect(
      queryLibraryPage(db, "two", {
        query: EMPTY_QUERY,
        cursor: first.nextCursor,
      }),
    ).rejects.toMatchObject({ code: "library_mismatch" });
    await expect(
      queryLibraryPage(db, "two", { libraryId: "one", query: EMPTY_QUERY }),
    ).rejects.toMatchObject({ code: "library_mismatch" });
  });
  it("keeps paging from the same position after writes between pages", async () => {
    const { db, sqlite } = setup();
    const request = { query: EMPTY_QUERY, limit: 10 };
    const first = await queryLibraryPage(db, "one", request);
    expect(first.ids.at(-1)).toBe("1190");
    sqlite.exec(
      "update saves set title='changed' where id='0001';insert into saves (id,source,source_id,url,title,saved_at,status,media_type) values ('new','local','new','pond:new','New',5000,'complete','text')",
    );
    const second = await queryLibraryPage(db, "one", {
      ...request,
      cursor: first.nextCursor,
    });
    expect(second.ids).toEqual(
      Array.from({ length: 10 }, (_, i) => String(1189 - i).padStart(4, "0")),
    );
    expect(second.total).toBe(1201);
  });
  it("pages through pinned saves without repeating or skipping", async () => {
    const { db } = setup();
    const pins = ["0003", "0001", "0500"];
    const request = {
      query: EMPTY_QUERY,
      sortKey: "savedAt",
      sortDir: "desc" as const,
      limit: 2,
    };
    let page = await queryLibraryPage(db, "library", request, [], pins);
    const ids = [...page.ids];
    while (page.nextCursor) {
      page = await queryLibraryPage(
        db,
        "library",
        { ...request, limit: 97, cursor: page.nextCursor },
        [],
        pins,
      );
      ids.push(...page.ids);
    }
    expect(ids.slice(0, 5)).toEqual(["0003", "0001", "0500", "1199", "1198"]);
    expect(ids).toHaveLength(1200);
    expect(new Set(ids).size).toBe(1200);
  });
  it("keeps seeded random order stable across pages and unrelated imports", async () => {
    const { db, sqlite } = setup();
    const request = {
      query: EMPTY_QUERY,
      sortKey: "random",
      sortDir: "asc" as const,
      randomSeed: "landscapes",
      limit: 127,
    };
    const first = await queryLibraryPage(db, "library", request);
    let page = first;
    const ids = [...page.ids];
    while (page.nextCursor) {
      page = await queryLibraryPage(db, "library", {
        ...request,
        cursor: page.nextCursor,
      });
      ids.push(...page.ids);
    }
    expect(new Set(ids).size).toBe(1200);
    expect((await queryLibraryIds(db, "library", request)).ids).toEqual(ids);
    const shuffled = await queryLibraryIds(db, "library", {
      ...request,
      randomSeed: "another",
    });
    expect(shuffled.ids).not.toEqual(ids);
    await expect(
      queryLibraryPage(db, "library", {
        ...request,
        randomSeed: "another",
        cursor: first.nextCursor,
      }),
    ).rejects.toMatchObject({ code: "stale_cursor" });
    sqlite.exec(
      "insert into saves (id,source,source_id,url,title,status,media_type) values ('new','local','new','pond:new','New','complete','text')",
    );
    expect(
      (await queryLibraryIds(db, "library", request)).ids.filter(
        (id) => id !== "new",
      ),
    ).toEqual(ids);
  });

  it("pages manual ranks before unordered saves and rejects stale arrangements", async () => {
    const { db } = setup();
    const order = ["0003", "0199", "0001"];
    const request = {
      query: EMPTY_QUERY,
      sortKey: "manual",
      sortDir: "asc" as const,
      limit: 2,
    };
    let page = await queryLibraryPage(db, "library", request, order);
    expect(page.ids).toEqual(["0003", "0199"]);
    await expect(
      queryLibraryPage(
        db,
        "library",
        { ...request, cursor: page.nextCursor },
        [...order].reverse(),
      ),
    ).rejects.toMatchObject({ code: "stale_cursor" });
    const ids = [...page.ids];
    while (page.nextCursor) {
      page = await queryLibraryPage(
        db,
        "library",
        { ...request, limit: 127, cursor: page.nextCursor },
        order,
      );
      ids.push(...page.ids);
    }
    expect(ids.slice(0, 4)).toEqual(["0003", "0199", "0001", "1199"]);
    expect(new Set(ids).size).toBe(1200);
    expect((await queryLibraryIds(db, "library", request, order)).ids).toEqual(
      ids,
    );
  });

  it("floats pinned ids to the front of any sort", async () => {
    const { db } = setup();
    const request = {
      query: EMPTY_QUERY,
      sortKey: "savedAt",
      sortDir: "desc" as const,
      limit: 5,
    };
    const unpinned = await queryLibraryPage(db, "library", request, [], []);
    expect(unpinned.ids[0]).toBe("1199");
    const pinned = await queryLibraryPage(
      db,
      "library",
      request,
      [],
      ["0003", "0001"],
    );
    expect(pinned.ids.slice(0, 4)).toEqual(["0003", "0001", "1199", "1198"]);
  });

  it("refreshes keyword results after imports and searchable metadata edits", async () => {
    const { db, sqlite } = setup();
    const idsFor = async (keywords: string) =>
      (
        await queryLibraryPage(db, "library", {
          query: EMPTY_QUERY,
          keywords,
        })
      ).ids;

    expect(await idsFor("newlyimported")).toEqual([]);
    sqlite
      .prepare(
        "insert into saves (id, source, source_id, url, title, saved_at, created_at, status, media_type) values ('imported', 'local', 'imported', 'pond:imported', 'newlyimported', 0, 0, 'complete', 'text')",
      )
      .run();
    expect(await idsFor("newlyimported")).toEqual(["imported"]);

    sqlite
      .prepare(
        "update saves set title=?, tags=?, notes=?, ocr_text=?, transcript=? where id='imported'",
      )
      .run(
        "renamedmarker",
        JSON.stringify(["tagmarker"]),
        "notesmarker",
        "ocrmarker",
        "transcriptmarker",
      );
    for (const keyword of [
      "renamedmarker",
      "tagmarker",
      "notesmarker",
      "ocrmarker",
      "transcriptmarker",
    ])
      expect(await idsFor(keyword)).toEqual(["imported"]);

    sqlite
      .prepare(
        "update saves set title='ordinary', tags='[]', notes=null, ocr_text=null, transcript=null where id='imported'",
      )
      .run();
    for (const keyword of [
      "renamedmarker",
      "tagmarker",
      "notesmarker",
      "ocrmarker",
      "transcriptmarker",
    ])
      expect(await idsFor(keyword)).toEqual([]);
  });

  it("filters by canonical source identity from site name and url", async () => {
    const { db, sqlite } = setup();
    sqlite
      .prepare("update saves set source=?, url=?, site_name=? where id=?")
      .run("twitter", "https://x.com/a/status/1", "x.com", "0001");
    sqlite
      .prepare("update saves set source=?, url=?, site_name=? where id=?")
      .run("web", "https://www.instagram.com/p/abc", "instagram.com", "0002");
    sqlite
      .prepare("update saves set source=?, url=?, site_name=? where id=?")
      .run("twitter", "https://twitter.com/b/status/2", null, "0003");
    const page = await queryLibraryPage(db, "library", {
      query: {
        combinator: "and",
        rules: [{ field: "source", operator: "eq", value: "x.com" }],
      },
      keywords: "reference",
    });
    expect(page.ids.sort()).toEqual(["0001", "0003"]);
    expect(page.total).toBe(2);
  });

  it("uses calendar midnight for Today rather than a rolling day", async () => {
    const { db, sqlite } = setup();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    sqlite
      .prepare("update saves set saved_at=? where id='0001'")
      .run(today.getTime() - 1);
    sqlite
      .prepare("update saves set saved_at=? where id='0002'")
      .run(today.getTime());
    const page = await queryLibraryPage(db, "library", {
      query: {
        combinator: "and",
        rules: [{ field: "savedAt", operator: "gte", value: "today" }],
      },
    });
    expect(page.ids).toEqual(["0002"]);
  });
});
