import { describe, expect, it } from "vitest";
import {
  accountImportScope,
  collectionFiling,
  importFilterReason,
  importsAnyList,
  importsEverything,
  importsListKind,
  listFilterReason,
  normalizeImportScope,
  sinceStart,
  sourcesSkippingLikes,
} from "./import-scope";

describe("normalizeImportScope", () => {
  it("collapses a full list selection to everything", () => {
    expect(
      normalizeImportScope("instagram", { listKinds: ["liked", "saved"] }),
    ).toEqual({ ok: true, scope: {} });
  });

  it("keeps a partial list selection in canonical order", () => {
    expect(
      normalizeImportScope("youtube", { listKinds: ["liked", "liked"] }),
    ).toEqual({ ok: true, scope: { listKinds: ["liked"] } });
  });

  it("keeps an empty list selection so every switch can stay off", () => {
    expect(normalizeImportScope("twitter", { listKinds: [] })).toEqual({
      ok: true,
      scope: { listKinds: [] },
    });
    expect(importsAnyList("twitter", { listKinds: [] })).toBe(false);
    expect(importsAnyList("twitter", {})).toBe(true);
    expect(importsListKind({ listKinds: [] }, "liked")).toBe(false);
    expect(importsListKind({ listKinds: [] }, "saved")).toBe(false);
  });

  it("rejects a selection that would import nothing", () => {
    expect(
      normalizeImportScope("pinterest", {
        collections: [{ id: "  ", name: "Blank" }],
      }),
    ).toEqual({ ok: false, problem: "no_collections" });
    expect(normalizeImportScope("twitter", { mediaKinds: [] })).toEqual({
      ok: false,
      problem: "no_media",
    });
  });

  it("drops parts the Source can't honor", () => {
    expect(
      normalizeImportScope("cosmos", {
        listKinds: ["saved"],
        collections: [{ id: "1", name: "Folder" }],
        since: "2024-01-01",
      }),
    ).toEqual({ ok: true, scope: {} });
    expect(normalizeImportScope("pinterest", { listKinds: ["liked"] })).toEqual(
      { ok: true, scope: {} },
    );
    expect(normalizeImportScope("tiktok", { mediaKinds: ["image"] })).toEqual({
      ok: true,
      scope: {},
    });
  });

  it("drops collections when the saved list is left out", () => {
    expect(
      normalizeImportScope("instagram", {
        listKinds: ["liked"],
        collections: [{ id: "17", name: "Type" }],
      }),
    ).toEqual({ ok: true, scope: { listKinds: ["liked"] } });
  });

  it("keeps Add to Folders off only alongside collections", () => {
    expect(
      normalizeImportScope("twitter", {
        listKinds: ["saved"],
        collections: [{ id: "17", name: "Type" }],
        addToFolders: false,
      }),
    ).toEqual({
      ok: true,
      scope: {
        listKinds: ["saved"],
        collections: [{ id: "17", name: "Type" }],
        addToFolders: false,
      },
    });
    expect(normalizeImportScope("twitter", { addToFolders: false })).toEqual({
      ok: true,
      scope: {},
    });
  });

  it("keeps filing every collection only where the saved list is the union of them", () => {
    expect(normalizeImportScope("twitter", { addToFolders: true })).toEqual({
      ok: true,
      scope: { addToFolders: true },
    });
    expect(normalizeImportScope("youtube", { addToFolders: true })).toEqual({
      ok: true,
      scope: {},
    });
    expect(
      normalizeImportScope("instagram", {
        listKinds: ["liked"],
        addToFolders: true,
      }),
    ).toEqual({ ok: true, scope: { listKinds: ["liked"] } });
  });

  it("dedupes boards and falls back to the id for a blank name", () => {
    expect(
      normalizeImportScope("pinterest", {
        collections: [
          { id: "915", name: " Design " },
          { id: "915", name: "Duplicate" },
          { id: "88", name: "" },
        ],
      }),
    ).toEqual({
      ok: true,
      scope: {
        collections: [
          { id: "915", name: "Design" },
          { id: "88", name: "88" },
        ],
      },
    });
  });

  it("keeps a partial media selection and collapses a full one", () => {
    expect(
      normalizeImportScope("twitter", { mediaKinds: ["video", "image"] }),
    ).toEqual({ ok: true, scope: { mediaKinds: ["image", "video"] } });
    expect(
      normalizeImportScope("instagram", { mediaKinds: ["video", "image"] }),
    ).toEqual({ ok: true, scope: {} });
  });

  it("keeps a real since day and rejects anything else", () => {
    expect(normalizeImportScope("reddit", { since: "2024-02-29" })).toEqual({
      ok: true,
      scope: { since: "2024-02-29" },
    });
    expect(normalizeImportScope("reddit", { since: "2023-02-29" })).toEqual({
      ok: false,
      problem: "bad_since",
    });
    expect(normalizeImportScope("reddit", { since: "Jan 1" })).toEqual({
      ok: false,
      problem: "bad_since",
    });
  });
});

describe("accountImportScope", () => {
  it("reads X Likes turned off before scoped imports as saved only", () => {
    expect(accountImportScope("twitter", { syncLikes: false })).toEqual({
      listKinds: ["saved"],
    });
  });

  it("prefers a chosen scope over the old Likes switch", () => {
    expect(
      accountImportScope("twitter", {
        syncLikes: false,
        importScope: { listKinds: ["liked"] },
      }),
    ).toEqual({ listKinds: ["liked"] });
    expect(accountImportScope("reddit", { syncLikes: false })).toBeUndefined();
  });
});

describe("sourcesSkippingLikes", () => {
  it("skips likes where every Account leaves them out", () => {
    expect(
      sourcesSkippingLikes([
        { source: "twitter", sync: { importScope: { listKinds: ["saved"] } } },
        { source: "instagram", sync: { syncLikes: false } },
        { source: "reddit", sync: {} },
      ]),
    ).toEqual(new Set(["twitter"]));
  });

  it("keeps likes when any Account for the Source imports them", () => {
    expect(
      sourcesSkippingLikes([
        { source: "twitter", sync: { importScope: { listKinds: ["saved"] } } },
        { source: "twitter", sync: {} },
      ]),
    ).toEqual(new Set());
  });

  it("leaves Sources without an Account to the extension switch", () => {
    expect(sourcesSkippingLikes([])).toEqual(new Set());
  });
});

describe("scope readers", () => {
  it("imports every list kind when no list is chosen", () => {
    expect(importsListKind(undefined, "liked")).toBe(true);
    expect(importsListKind({ listKinds: ["saved"] }, "liked")).toBe(false);
  });

  it("reports everything unless some part is narrowed", () => {
    expect(importsEverything(undefined)).toBe(true);
    expect(importsEverything({})).toBe(true);
    expect(importsEverything({ collections: [] })).toBe(true);
    expect(importsEverything({ listKinds: ["saved"] })).toBe(false);
    expect(
      importsEverything({ collections: [{ id: "1", name: "Type" }] }),
    ).toBe(false);
    expect(importsEverything({ mediaKinds: ["image"] })).toBe(false);
    expect(importsEverything({ since: "2024-01-01" })).toBe(false);
  });

  it("skips captures outside the media or date filter", () => {
    const scope = { mediaKinds: ["image" as const], since: "2024-01-01" };
    const recent = new Date(2024, 5, 1);
    const save = { listKinds: [], publishedAt: recent };
    expect(
      importFilterReason(scope, { ...save, mediaType: "image" }),
    ).toBeNull();
    expect(importFilterReason(scope, { ...save, mediaType: "video" })).toBe(
      "media",
    );
    expect(importFilterReason(scope, { ...save, mediaType: null })).toBe(
      "media",
    );
    expect(
      importFilterReason(scope, {
        ...save,
        mediaType: "image",
        publishedAt: new Date(2023, 11, 31, 23, 59),
      }),
    ).toBe("since");
  });

  it("keeps a capture whose publish date is unknown", () => {
    const save = { listKinds: [], publishedAt: null };
    expect(
      importFilterReason(
        { since: "2024-01-01" },
        { ...save, mediaType: "image" },
      ),
    ).toBeNull();
    expect(
      importFilterReason(undefined, { ...save, mediaType: "video" }),
    ).toBeNull();
  });

  it("skips a save only on lists the scope leaves out", () => {
    const scope = { listKinds: ["saved" as const] };
    const save = { mediaType: "image" as const, publishedAt: null };
    expect(importFilterReason(scope, { ...save, listKinds: ["liked"] })).toBe(
      "list",
    );
    expect(
      importFilterReason(scope, { ...save, listKinds: ["liked", "saved"] }),
    ).toBeNull();
    expect(importFilterReason(scope, { ...save, listKinds: [] })).toBeNull();
    expect(
      importFilterReason(undefined, { ...save, listKinds: ["liked"] }),
    ).toBeNull();
  });

  it("checks lists without a capture", () => {
    expect(listFilterReason({ listKinds: ["saved"] }, ["liked"])).toBe("list");
    expect(listFilterReason({ listKinds: ["liked"] }, ["liked"])).toBeNull();
    expect(listFilterReason({ mediaKinds: ["image"] }, ["liked"])).toBeNull();
  });

  it("starts the since day at local midnight", () => {
    expect(sinceStart("2024-03-05")?.getTime()).toBe(
      new Date(2024, 2, 5).getTime(),
    );
    expect(sinceStart("2024-13-01")).toBeNull();
  });
});

describe("collectionFiling", () => {
  const DESIGN = { id: "c1", name: "Design" };

  it("files picked collections unless you turn it off", () => {
    expect(collectionFiling("twitter", { collections: [DESIGN] })).toBe(
      "picked",
    );
    expect(
      collectionFiling("twitter", {
        collections: [DESIGN],
        addToFolders: false,
      }),
    ).toBe("off");
  });

  it("files every collection only when you turn it on", () => {
    expect(collectionFiling("pinterest", undefined)).toBe("off");
    expect(collectionFiling("pinterest", { addToFolders: true })).toBe("every");
    expect(collectionFiling("youtube", { addToFolders: true })).toBe("off");
  });
});
