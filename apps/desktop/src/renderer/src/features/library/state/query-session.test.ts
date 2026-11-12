import { EMPTY_QUERY } from "@pond/schema/filters";
import type { LibraryQueryPage } from "@shared/library-query";
import { describe, expect, it } from "vitest";
import { createQuerySession } from "./query-session";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function page(ids: string[], more = false): LibraryQueryPage {
  return {
    ids,
    total: 4,
    revision: 1,
    libraryId: "library",
    nextCursor: more
      ? { id: ids.at(-1) ?? "", value: 1, libraryId: "library", revision: 1 }
      : null,
  };
}
describe("query session", () => {
  it("discards an older reply after the user changes scope", async () => {
    const first = deferred<LibraryQueryPage>();
    let calls = 0;
    const hydrated: string[][] = [];
    const session = createQuerySession(
      {
        page: async () => (++calls === 1 ? first.promise : page(["new"])),
        ids: async () => ({ ids: [] }),
        refresh: async (ids) => {
          hydrated.push([...ids]);
        },
      },
      () => {},
    );
    session.setRequest({ query: EMPTY_QUERY, keywords: "old" });
    const old = session.load();
    session.setRequest({ query: EMPTY_QUERY, keywords: "new" });
    await session.load();
    first.resolve(page(["old"]));
    await old;
    expect(session.snapshot().page?.ids).toEqual(["new"]);
    expect(hydrated).toEqual([["new"]]);
  });
  it("keeps the loaded result extent when a mutation refreshes pagination", async () => {
    let calls = 0;
    const pages = [
      page(["a", "b"], true),
      page(["c", "d"]),
      page(["x", "a"], true),
      page(["b", "c"]),
    ];
    const session = createQuerySession(
      {
        page: async () => pages[calls++] ?? page([]),
        ids: async () => ({ ids: [] }),
        refresh: async () => {},
      },
      () => {},
    );
    session.setRequest({ query: EMPTY_QUERY });
    await session.load();
    await session.load(true);
    await session.load();
    expect(session.snapshot().page?.ids).toEqual(["x", "a", "b", "c"]);
  });
  it("does not apply Select All from an abandoned query", async () => {
    const response = deferred<{ ids: string[] }>();
    const session = createQuerySession(
      {
        page: async () => page([]),
        ids: () => response.promise,
        refresh: async () => {},
      },
      () => {},
    );
    session.setRequest({ query: EMPTY_QUERY, keywords: "one" });
    const selection = session.allIds();
    session.setRequest({ query: EMPTY_QUERY, keywords: "two" });
    response.resolve({ ids: ["one"] });
    expect(await selection).toBeNull();
  });
  it("keeps the current results while only the keywords change", async () => {
    const session = createQuerySession(
      {
        page: async (request) =>
          page(request.keywords ? ["match"] : ["a", "b"]),
        ids: async () => ({ ids: [] }),
        refresh: async () => {},
      },
      () => {},
    );
    session.setRequest({ query: EMPTY_QUERY });
    await session.load();
    session.setRequest({ query: EMPTY_QUERY, keywords: "fall" });
    expect(session.snapshot()).toMatchObject({
      loading: true,
      page: { ids: ["a", "b"] },
    });
    await session.load();
    expect(session.snapshot().page?.ids).toEqual(["match"]);
  });
  it("clears the results when the scope changes", async () => {
    const session = createQuerySession(
      {
        page: async () => page(["a"]),
        ids: async () => ({ ids: [] }),
        refresh: async () => {},
      },
      () => {},
    );
    session.setRequest({ query: EMPTY_QUERY });
    await session.load();
    session.setRequest({ query: EMPTY_QUERY, scope: { deletedOnly: true } });
    expect(session.snapshot().page).toBeNull();
  });
  it("reports a retype only when the keywords alone change", () => {
    const session = createQuerySession(
      {
        page: async () => page(["a"]),
        ids: async () => ({ ids: [] }),
        refresh: async () => {},
      },
      () => {},
    );
    expect(session.setRequest({ query: EMPTY_QUERY })).toBe(false);
    expect(session.setRequest({ query: EMPTY_QUERY, keywords: "fall" })).toBe(
      true,
    );
    expect(
      session.setRequest({
        query: EMPTY_QUERY,
        keywords: "fall",
        scope: { deletedOnly: true },
      }),
    ).toBe(false);
  });
  it("does not stretch a new search to the previous result count", async () => {
    let calls = 0;
    const session = createQuerySession(
      {
        page: async () => {
          calls++;
          return calls === 1 ? page(["a", "b", "c"]) : page(["x"], true);
        },
        ids: async () => ({ ids: [] }),
        refresh: async () => {},
      },
      () => {},
    );
    session.setRequest({ query: EMPTY_QUERY });
    await session.load();
    session.setRequest({ query: EMPTY_QUERY, keywords: "x" });
    await session.load();
    expect(calls).toBe(2);
    expect(session.snapshot().page?.ids).toEqual(["x"]);
  });
  it("keeps the same page when a reload returns identical results", async () => {
    let next = page(["a", "b"]);
    const session = createQuerySession(
      {
        page: async () => structuredClone(next),
        ids: async () => ({ ids: [] }),
        refresh: async () => {},
      },
      () => {},
    );
    session.setRequest({ query: EMPTY_QUERY });
    await session.load();
    const first = session.snapshot().page;
    await session.load();
    expect(session.snapshot().page).toBe(first);
    next = page(["b", "a"]);
    await session.load();
    expect(session.snapshot().page?.ids).toEqual(["b", "a"]);
  });
  it("surfaces a failed search instead of claiming there are no matches", async () => {
    const session = createQuerySession(
      {
        page: async () => {
          throw new Error("invalid query");
        },
        ids: async () => ({ ids: [] }),
        refresh: async () => {},
      },
      () => {},
    );
    session.setRequest({ query: EMPTY_QUERY });
    await session.load();
    expect(session.snapshot()).toMatchObject({
      loading: false,
      error: "Couldn't complete the search. Try again.",
      page: null,
    });
  });
});
