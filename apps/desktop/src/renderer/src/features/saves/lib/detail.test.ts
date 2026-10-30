import { describe, expect, it } from "vitest";
import type { Save } from "@/features/saves/types";
import type { AccountRef } from "@/features/search/query";
import {
  collectIdentityRows,
  type DetailRow,
  groupDetailRows,
  isSameTitleAndContent,
  pickAuthorProfileUrl,
} from "./detail";

function row(id: string, label = id): DetailRow {
  return { id, label, value: id, kind: "text" };
}

const cosmosAccount: AccountRef = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  source: "cosmos",
  handle: "jane",
  label: null,
  avatarUrl: "https://example.com/jane.jpg",
};

function save(partial: Partial<Save> & { id: string }): Save {
  return {
    url: "https://www.cosmos.so/jane/e/abc",
    title: null,
    description: null,
    notes: null,
    source: "cosmos",
    sourceId: "abc",
    accountId: null,
    author: null,
    mediaType: "image",
    mediaUrl: null,
    fileSize: null,
    width: null,
    height: null,
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
    tags: [],
    files: [],
    ...partial,
  };
}

describe("groupDetailRows", () => {
  it("splits identity, file, and dates into separate islands", () => {
    const groups = groupDetailRows([
      row("id", "ID"),
      row("author", "Author"),
      row("from", "From"),
      row("platform", "Platform"),
      row("type", "Type"),
      row("size", "Size"),
      row("published", "Published"),
      row("imported", "Imported"),
    ]);

    expect(groups.map((g) => g.title)).toEqual(["Properties", "File", "Dates"]);
    expect(groups[0]?.rows.map((r) => r.id)).toEqual([
      "author",
      "from",
      "platform",
      "type",
    ]);
    expect(groups[1]?.rows.map((r) => r.id)).toEqual(["size", "id"]);
    expect(groups[2]?.rows.map((r) => r.id)).toEqual(["published", "imported"]);
  });

  it("omits empty islands", () => {
    const groups = groupDetailRows([row("author", "Author")]);
    expect(groups.map((g) => g.title)).toEqual(["Properties"]);
  });
});

describe("isSameTitleAndContent", () => {
  it("treats a title that is the content plus a url as the same", () => {
    expect(
      isSameTitleAndContent(
        "make loading the page feel faster https://t.co/kw5abc",
        "make loading the page feel faster",
      ),
    ).toBe(true);
  });

  it("keeps a distinct title", () => {
    expect(
      isSameTitleAndContent("Screenlife - Wikipedia", "A short article body"),
    ).toBe(false);
  });
});

describe("pickAuthorProfileUrl", () => {
  it("uses the captured profile url", () => {
    expect(
      pickAuthorProfileUrl({
        source: "instagram",
        rawJson: {
          capture: {
            id: "p",
            source: "instagram",
            url: "https://www.instagram.com/p/abc/",
            media: [],
            author: {
              handle: "other",
              profileUrl: "https://www.instagram.com/sofinna/",
            },
          },
          extractorId: "test",
          extractedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).toBe("https://www.instagram.com/sofinna/");
  });

  it("reconstructs an instagram profile from handle when the capture has none", () => {
    expect(
      pickAuthorProfileUrl({
        source: "instagram",
        rawJson: {
          capture: {
            id: "p",
            source: "instagram",
            url: "https://www.instagram.com/p/abc/",
            media: [],
            author: { handle: "@sofinna" },
          },
          extractorId: "test",
          extractedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).toBe("https://www.instagram.com/sofinna/");
  });

  it("uses the youtube channel url from ytdlp", () => {
    expect(
      pickAuthorProfileUrl({
        source: "youtube",
        rawJson: {
          capture: {
            id: "v",
            source: "youtube",
            url: "https://www.youtube.com/watch?v=abc",
            media: [],
          },
          ytdlp: { channel_url: "https://www.youtube.com/@nasa" },
          extractorId: "test",
          extractedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).toBe("https://www.youtube.com/@nasa");
  });

  it("ignores non-http profile urls", () => {
    expect(
      pickAuthorProfileUrl({
        source: "instagram",
        rawJson: {
          capture: {
            id: "p",
            source: "instagram",
            url: "https://www.instagram.com/p/abc/",
            media: [],
            author: { profileUrl: "javascript:alert(1)" },
          },
          extractorId: "test",
          extractedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).toBeNull();
  });
});

describe("collectIdentityRows", () => {
  it("adds an Account row for the connected source account", () => {
    const from = collectIdentityRows(
      save({ id: "s1", accountId: cosmosAccount.id }),
      [cosmosAccount],
    ).find((r) => r.id === "from");

    expect(from).toEqual({
      id: "from",
      label: "Account",
      value: "@jane",
      kind: "account",
      accountId: cosmosAccount.id,
      avatarUrl: "https://example.com/jane.jpg",
    });
  });

  it("names where an imported save came from", () => {
    const rows = collectIdentityRows(
      save({ id: "s1", source: "local", importedFrom: "eagle" }),
    );
    expect(rows.find((r) => r.id === "importedFrom")).toEqual({
      id: "importedFrom",
      label: "Imported From",
      value: "Eagle",
      kind: "text",
    });
    expect(
      collectIdentityRows(save({ id: "s2" })).find(
        (r) => r.id === "importedFrom",
      ),
    ).toBeUndefined();
  });

  it("omits Account when the account is unknown", () => {
    const rows = collectIdentityRows(
      save({ id: "s1", accountId: cosmosAccount.id }),
      [],
    );
    expect(rows.find((r) => r.id === "from")).toBeUndefined();
  });

  it("marks a watch so the row can open watch detail", () => {
    const watch: AccountRef = {
      ...cosmosAccount,
      watch: true,
      kind: "user",
    };
    const from = collectIdentityRows(save({ id: "s1", accountId: watch.id }), [
      watch,
    ]).find((r) => r.id === "from");
    expect(from?.watch).toBe(true);
    expect(from?.label).toBe("Watch");
  });

  it("shows liked and saved as a Saved To property", () => {
    const row = collectIdentityRows(
      save({ id: "s1", listKinds: ["saved", "liked"], mediaType: null }),
    ).find((r) => r.id === "list");
    expect(row).toMatchObject({
      id: "list",
      label: "Saved To",
      value: "Liked, Saved",
    });
  });
});
