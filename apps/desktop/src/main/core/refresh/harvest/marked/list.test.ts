// @vitest-environment node

import { runInContext } from "node:vm";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";
import { markedRef } from "./fixture";
import { buildMarkedListExpression, MARKED_LIST_URL } from "./list";

interface Reply {
  status: number;
  body?: object;
}

const SIGNED_IN: Reply = {
  status: 200,
  body: { data: { user: { id: "user_1", name: "Pond" } } },
};

const OLD = "11111111-1111-4111-8111-111111111111";
const NEW = "22222222-2222-4222-8222-222222222222";

const LIBRARY: Reply = {
  status: 200,
  body: {
    data: [
      markedRef(NEW, "2026-10-28T10:00:00.000Z"),
      markedRef(OLD, "2026-09-01T10:00:00.000Z"),
      markedRef(NEW, "2026-10-28T10:00:00.000Z"),
    ],
  },
};

async function walk(
  args: Partial<ListHarvestArgs>,
  replies: { getSession: Reply; listLibraryRefs?: Reply },
): Promise<{ result: ListHarvestResult; requested: string[] }> {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: MARKED_LIST_URL,
    runScripts: "outside-only",
  });
  const requested: string[] = [];
  Object.assign(dom.window, {
    fetch: async (url: string) => {
      const method = url.replace("/api/data/", "");
      requested.push(method);
      const reply =
        method === "getSession"
          ? replies.getSession
          : (replies.listLibraryRefs ?? { status: 500 });
      return new Response(JSON.stringify(reply.body ?? {}), {
        status: reply.status,
      });
    },
  });
  const result: ListHarvestResult = await runInContext(
    buildMarkedListExpression({ knownIds: [], ...args }),
    dom.getInternalVMContext(),
  );
  return { result, requested };
}

function ids(result: ListHarvestResult): string[] {
  return result.ok ? result.entries.map((entry) => entry.sourceId) : [];
}

describe("Marked library walk", () => {
  it("reads the whole library in one call and marks it complete", async () => {
    const { result, requested } = await walk(
      {},
      { getSession: SIGNED_IN, listLibraryRefs: LIBRARY },
    );
    expect(requested).toEqual(["getSession", "listLibraryRefs"]);
    expect(ids(result)).toEqual([NEW, OLD]);
    expect(result).toMatchObject({
      ok: true,
      reachedEnd: true,
      complete: true,
    });
    if (!result.ok) return;
    expect(result.entries[0]).toMatchObject({
      url: `https://marked.dev/ref/${NEW}`,
      savedAt: "2026-10-28T10:00:00.000Z",
      author: "Augustas",
      mediaType: "video",
      mediaUrl:
        "https://marked.dev/seed/media/x-augustasdesign-2113878354516394052.mp4",
      listKinds: ["saved"],
    });
  });

  it("skips refs saved before the since limit and leaves the list open", async () => {
    const { result } = await walk(
      { savedSince: "2026-10-01T00:00:00.000Z" },
      { getSession: SIGNED_IN, listLibraryRefs: LIBRARY },
    );
    expect(ids(result)).toEqual([NEW]);
    expect(result.ok && result.complete).toBeFalsy();
  });

  it("asks you to sign in when there is no session", async () => {
    const { result, requested } = await walk(
      {},
      { getSession: { status: 200, body: { data: null } } },
    );
    expect(result).toEqual({ ok: false, reason: "auth_required" });
    expect(requested).toEqual(["getSession"]);
  });

  it("reports a rate limit from the library call", async () => {
    const { result } = await walk(
      {},
      { getSession: SIGNED_IN, listLibraryRefs: { status: 429 } },
    );
    expect(result).toEqual({ ok: false, reason: "rate_limited" });
  });
});
