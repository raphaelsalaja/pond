import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import type { CollectionsReply } from "../lib/collections-reply";
import { buildInstagramCollectionsExpression } from "./collections";

interface Reply {
  status: number;
  /** Absent when Instagram answers with an HTML page. */
  body?: {
    items?: Array<{
      collection_id?: number;
      collection_name?: string;
      collection_type?: string;
      collection_media_count?: number;
    }>;
    more_available?: boolean;
    next_max_id?: string;
    message?: string;
    status?: string;
  };
}

const RECIPES: Reply = {
  status: 200,
  body: {
    items: [
      {
        collection_id: 17,
        collection_name: "Recipes",
        collection_type: "MEDIA",
        collection_media_count: 4,
      },
      { collection_id: 1, collection_type: "ALL_MEDIA_AUTO_COLLECTION" },
    ],
    more_available: false,
  },
};

const NOT_FOUND_PAGE: Reply = { status: 404 };

async function run(
  respond: (url: string) => Reply,
): Promise<{ result: CollectionsReply; urls: string[] }> {
  const urls: string[] = [];
  const result = await runInNewContext(buildInstagramCollectionsExpression(), {
    URLSearchParams,
    setTimeout: (fn: () => void) => setTimeout(fn, 0),
    fetch: async (url: string) => {
      urls.push(url);
      const { status, body } = respond(url);
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: {
          get: () => (body ? "application/json" : 'text/html; charset="utf-8"'),
        },
        json: async () => {
          if (!body) throw new SyntaxError("not json");
          return body;
        },
      };
    },
  });
  return { result, urls };
}

describe("buildInstagramCollectionsExpression", () => {
  it("lists the collections you made", async () => {
    const { result, urls } = await run(() => RECIPES);
    expect(result).toEqual({
      ok: true,
      collections: [{ id: "17", name: "Recipes", count: 4 }],
    });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/^\/api\/v1\/collections\/list\/\?/);
  });

  it("reads the API host when www answers with its not-found page", async () => {
    const { result, urls } = await run((url) =>
      url.startsWith("https://i.instagram.com/") ? RECIPES : NOT_FOUND_PAGE,
    );
    expect(result).toEqual({
      ok: true,
      collections: [{ id: "17", name: "Recipes", count: 4 }],
    });
    expect(urls).toHaveLength(2);
    expect(urls[1]).toMatch(
      /^https:\/\/i\.instagram\.com\/api\/v1\/collections\/list\/\?/,
    );
  });

  it("keeps paging on the API host once www has failed", async () => {
    const { result, urls } = await run((url) => {
      if (!url.startsWith("https://i.instagram.com/")) return NOT_FOUND_PAGE;
      if (url.includes("max_id=")) {
        return {
          status: 200,
          body: {
            items: [{ collection_id: 18, collection_name: "Trips" }],
            more_available: false,
          },
        };
      }
      return {
        status: 200,
        body: {
          items: [{ collection_id: 17, collection_name: "Recipes" }],
          more_available: true,
          next_max_id: "next",
        },
      };
    });
    expect(result).toEqual({
      ok: true,
      collections: [
        { id: "17", name: "Recipes", count: null },
        { id: "18", name: "Trips", count: null },
      ],
    });
    expect(urls).toHaveLength(3);
    expect(urls[2]).toMatch(/^https:\/\/i\.instagram\.com\/.*max_id=next/);
  });

  it("reports the status when both hosts answer with a page", async () => {
    const { result, urls } = await run(() => NOT_FOUND_PAGE);
    expect(result).toEqual({
      ok: false,
      reason: "unknown",
      detail: '404 text/html; charset="utf-8"',
    });
    expect(urls).toHaveLength(2);
  });

  it("fails a reply Instagram marks as failed instead of listing nothing", async () => {
    const { result } = await run(() => ({
      status: 200,
      body: {
        message: "We're sorry, but something went wrong. Please try again.",
        status: "fail",
      },
    }));
    expect(result).toEqual({
      ok: false,
      reason: "unknown",
      detail: "200 We're sorry, but something went wrong. Please try again.",
    });
  });

  it("names a checkpoint instead of failing blind", async () => {
    const { result } = await run(() => ({
      status: 400,
      body: { message: "checkpoint_required", status: "fail" },
    }));
    expect(result).toEqual({
      ok: false,
      reason: "checkpoint",
      detail: "checkpoint_required",
    });
  });

  it("treats a login prompt as signed out", async () => {
    const { result } = await run(() => ({
      status: 400,
      body: { message: "login_required" },
    }));
    expect(result).toEqual({ ok: false, reason: "auth_required" });
  });

  it("reports the status when Instagram answers with a page", async () => {
    const { result } = await run(() => ({ status: 200 }));
    expect(result).toEqual({
      ok: false,
      reason: "unknown",
      detail: '200 text/html; charset="utf-8"',
    });
  });
});
