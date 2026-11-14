import type { JsonValue } from "@pond/schema/json";
import { describe, expect, it, vi } from "vitest";
import { type ArenaGet, arenaAccessToken, readArenaBlocks } from "./list";

function block(id: number) {
  return {
    id,
    base_type: "Block",
    type: "Image",
    title: `Block ${id}`,
    created_at: "2024-06-01T00:00:00.000Z",
  };
}

function page(ids: number[], hasMore: boolean, extra: JsonValue[] = []) {
  return {
    meta: {
      current_page: 1,
      has_more_pages: hasMore,
      per_page: 100,
      total_pages: hasMore ? 2 : 1,
      total_count: ids.length + (hasMore ? 20 : 0),
    },
    data: [...ids.map(block), ...extra],
  };
}

function json(body: JsonValue, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function client(pages: Record<string, Response>) {
  const requested: URL[] = [];
  const get: ArenaGet = vi.fn(async (raw) => {
    const url = new URL(raw);
    requested.push(url);
    const key = `${url.pathname}?page=${url.searchParams.get("page")}`;
    return pages[key] ?? json({ error: "missing" }, 404);
  });
  return { get, requested };
}

function ids(result: Awaited<ReturnType<typeof readArenaBlocks>>): string[] {
  return result.ok ? result.entries.map((entry) => entry.sourceId) : [];
}

describe("Are.na block pages", () => {
  it("reads every page when the library is larger than one page of 100", async () => {
    const first = Array.from({ length: 100 }, (_, i) => i + 1);
    const second = Array.from({ length: 20 }, (_, i) => i + 101);
    const { get, requested } = client({
      "/v3/users/ada/contents?page=1": json(page(first, true)),
      "/v3/users/ada/contents?page=2": json(
        page(second, false, [
          { id: 999, base_type: "Channel", type: "Channel", title: "Shelf" },
        ]),
      ),
    });

    const result = await readArenaBlocks(
      { accountKey: "ada", knownIds: [], earlyStop: false },
      get,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reachedEnd).toBe(true);
    expect(result.resumeCursor).toBeUndefined();
    expect(ids(result)).toEqual([...first, ...second].map(String));
    expect(result.entries[0]).toMatchObject({
      url: "https://www.are.na/block/1",
      title: "Block 1",
      savedAt: "2024-06-01T00:00:00.000Z",
    });
    expect(requested.map((url) => url.searchParams.get("page"))).toEqual([
      "1",
      "2",
    ]);
    for (const url of requested) {
      expect(url.searchParams.get("per")).toBe("100");
      expect(url.searchParams.get("type")).toBe("Block");
      expect(url.searchParams.get("sort")).toBe("created_at_desc");
    }
  });

  it("keeps the next page when a later page fails, instead of ending the sync", async () => {
    const first = Array.from({ length: 100 }, (_, i) => i + 1);
    const { get } = client({
      "/v3/users/ada/contents?page=1": json(page(first, true)),
      "/v3/users/ada/contents?page=2": json({ error: "nope" }, 500),
    });

    const result = await readArenaBlocks(
      { accountKey: "@ada", knownIds: [], earlyStop: false },
      get,
    );

    expect(result).toMatchObject({
      ok: true,
      reachedEnd: false,
      resumeCursor: "user:2",
    });
    expect(ids(result)).toHaveLength(100);
  });

  it("resumes at the page the last run stopped on", async () => {
    const { get, requested } = client({
      "/v3/users/ada/contents?page=2": json(page([101, 102], false)),
    });

    const result = await readArenaBlocks(
      { accountKey: "ada", knownIds: [], resumeCursor: "user:2" },
      get,
    );

    expect(requested.map((url) => url.pathname + url.search)).toEqual([
      "/v3/users/ada/contents?page=2&per=100&sort=created_at_desc&type=Block",
    ]);
    expect(ids(result)).toEqual(["101", "102"]);
    expect(result.ok && result.reachedEnd).toBe(true);
  });

  it("stops after two pages of blocks it already has", async () => {
    const first = Array.from({ length: 100 }, (_, i) => i + 1);
    const second = Array.from({ length: 100 }, (_, i) => i + 101);
    const { get, requested } = client({
      "/v3/users/ada/contents?page=1": json(page(first, true)),
      "/v3/users/ada/contents?page=2": json({
        ...page(second, true),
        meta: { has_more_pages: true, total_pages: 3 },
      }),
      "/v3/users/ada/contents?page=3": json(page([201], false)),
    });

    const result = await readArenaBlocks(
      {
        accountKey: "ada",
        knownIds: [...first, ...second].map(String),
        earlyStop: true,
      },
      get,
    );

    expect(requested).toHaveLength(2);
    expect(result).toMatchObject({ ok: true, reachedEnd: true });
    expect(result.ok && result.resumeCursor).toBeUndefined();
  });

  it("reads a group profile when the slug is not a user", async () => {
    const { get, requested } = client({
      "/v3/groups/studio/contents?page=1": json(page([7], false)),
    });

    const result = await readArenaBlocks(
      { accountKey: "studio", knownIds: [] },
      get,
    );

    expect(requested.map((url) => url.pathname)).toEqual([
      "/v3/users/studio/contents",
      "/v3/groups/studio/contents",
    ]);
    expect(ids(result)).toEqual(["7"]);
  });

  it("asks for a sign-in when the contents API rejects the session", async () => {
    const { get } = client({
      "/v3/users/ada/contents?page=1": json({ error: "no" }, 401),
    });

    await expect(
      readArenaBlocks({ accountKey: "ada", knownIds: [] }, get),
    ).resolves.toEqual({ ok: false, reason: "auth_required" });
  });

  it("reads the session token embedded in the signed-in profile", () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
      { props: { user: { authentication_token: "session-token" } } },
    )}</script>`;
    expect(arenaAccessToken(html)).toBe("session-token");
    expect(
      arenaAccessToken(
        `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { user: null } })}</script>`,
      ),
    ).toBeNull();
    expect(arenaAccessToken("<html></html>")).toBeNull();
  });
});
