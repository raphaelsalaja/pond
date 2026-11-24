// @vitest-environment node

import { runInContext } from "node:vm";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";
import {
  clusterReply,
  POST_ID,
  renderedResult,
  SAVED_QUERY,
  savedPost,
} from "./fixture";
import { buildLinkedInListExpression, LINKEDIN_LIST_URL } from "./list";

interface Reply {
  status: number;
  body?: object;
}

interface Walk {
  args?: Partial<ListHarvestArgs>;
  replies?: Map<string, Reply>;
  resources?: Array<string>;
  html?: string;
  url?: string;
}

function page(ids: Array<string>, start: number, total: number): Reply {
  const reply = clusterReply(ids.map(savedPost), { start, count: 10, total });
  return { status: 200, body: reply };
}

function postIds(prefix: string, count: number): Array<string> {
  return Array.from({ length: count }, (_, i) => `${prefix}${100 + i}`);
}

async function walk({
  args = {},
  replies = new Map(),
  resources = [SAVED_QUERY],
  html = "",
  url = LINKEDIN_LIST_URL,
}: Walk) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, {
    url,
    runScripts: "outside-only",
  });
  dom.window.document.cookie = 'JSESSIONID="ajax:5551234"';
  const requested: Array<string> = [];
  const tokens: Array<string> = [];
  Object.defineProperty(dom.window, "performance", {
    configurable: true,
    value: {
      getEntriesByType: () =>
        resources.map((name) => ({ name: new URL(name, url).toString() })),
    },
  });
  Object.assign(dom.window, {
    setTimeout: (fn: () => void) => setTimeout(fn, 0),
    fetch: async (target: string, init?: RequestInit) => {
      const start = /start(?::|%3A)(\d+)/.exec(target)?.[1] ?? "";
      requested.push(start);
      tokens.push(new Headers(init?.headers).get("csrf-token") ?? "");
      const reply = replies.get(start) ?? { status: 404 };
      return {
        status: reply.status,
        ok: reply.status >= 200 && reply.status < 300,
        url: "",
        headers: new Headers(),
        json: async () => reply.body ?? {},
      };
    },
  });
  const result: ListHarvestResult = await runInContext(
    buildLinkedInListExpression({ knownIds: [], ...args }),
    dom.getInternalVMContext(),
  );
  return { result, requested, tokens };
}

function ids(result: ListHarvestResult): Array<string> {
  return result.ok ? result.entries.map((entry) => entry.sourceId) : [];
}

describe("LinkedIn saved posts walk", () => {
  it("replays the page's own query until it has every saved post", async () => {
    const first = postIds("72123456789012345", 10);
    const { result, requested, tokens } = await walk({
      replies: new Map([
        ["0", page(first, 0, 11)],
        ["10", page([POST_ID], 10, 11)],
      ]),
    });
    expect(requested).toEqual(["0", "10"]);
    expect(tokens).toEqual(["ajax:5551234", "ajax:5551234"]);
    expect(ids(result)).toHaveLength(11);
    expect(result).toMatchObject({
      ok: true,
      reachedEnd: true,
      complete: true,
    });
  });

  it("stops after two pages of posts it already has", async () => {
    const pageOne = postIds("72123456789012345", 10);
    const pageTwo = postIds("72123456789012346", 10);
    const { result, requested } = await walk({
      args: { knownIds: [...pageOne, ...pageTwo] },
      replies: new Map([
        ["0", page(pageOne, 0, 1000)],
        ["10", page(pageTwo, 10, 1000)],
        ["20", page([POST_ID], 20, 1000)],
      ]),
    });
    expect(requested).toEqual(["0", "10"]);
    expect(result).toMatchObject({ ok: true, reachedEnd: true });
    expect(result.ok && result.complete).toBeFalsy();
  });

  it("resumes at the offset a timed-out run stopped on", async () => {
    const { result, requested } = await walk({
      args: { resumeCursor: "40" },
      replies: new Map([["40", page([POST_ID], 40, 41)]]),
    });
    expect(requested).toEqual(["40"]);
    expect(ids(result)).toEqual([POST_ID]);
    expect(result.ok && result.complete).toBeFalsy();
  });

  it("hard-stops when LinkedIn flags the session", async () => {
    const { result } = await walk({
      replies: new Map([["0", { status: 999 }]]),
    });
    expect(result).toEqual({
      ok: false,
      reason: "auth_required",
      error: "checkpoint",
    });
  });

  it("hard-stops when the page lands on a checkpoint", async () => {
    const { result, requested } = await walk({
      url: "https://www.linkedin.com/checkpoint/challenge/AgF",
    });
    expect(requested).toEqual([]);
    expect(result).toMatchObject({ ok: false, error: "checkpoint" });
  });

  it("reads the rendered list when the query can't be found", async () => {
    const { result, requested } = await walk({
      resources: [],
      html: `<ul>${renderedResult(POST_ID)}</ul>`,
    });
    expect(requested).toEqual([]);
    expect(result.ok && result.complete).toBeFalsy();
    expect(result.ok && result.entries).toEqual([
      {
        sourceId: POST_ID,
        url: `https://www.linkedin.com/feed/update/urn:li:activity:${POST_ID}/`,
        listKinds: ["saved"],
        title: "Shipping our new design system today.",
        description:
          "Shipping our new design system today.\nHere's what we learned.",
        author: "Jane Doe",
        mediaUrl:
          "https://media.licdn.com/dms/image/v2/D4E22AQ/feedshare-shrink_800/0",
        mediaUrls: [
          {
            url: "https://media.licdn.com/dms/image/v2/D4E22AQ/feedshare-shrink_800/0",
            type: "image",
          },
        ],
        mediaType: "image",
      },
    ]);
  });
});
