// @vitest-environment node

import { runInContext } from "node:vm";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { markedRef } from "./fixture";
import { adapt, buildExpression } from "./item";

const REF_ID = "55c95cf4-a3d8-5a58-a390-8912b842e6fb";
const REF_URL = `https://marked.dev/ref/${REF_ID}`;

async function harvest(reply: { status: number; body?: object }) {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: REF_URL,
    runScripts: "outside-only",
  });
  const requests: Array<{ url: string; body: string }> = [];
  Object.assign(dom.window, {
    fetch: async (url: string, init: { body: string }) => {
      requests.push({ url, body: init.body });
      return new Response(JSON.stringify(reply.body ?? {}), {
        status: reply.status,
      });
    },
  });
  const raw = await runInContext(
    buildExpression(REF_ID),
    dom.getInternalVMContext(),
  );
  const capture = adapt(raw, {
    source: "marked",
    url: REF_URL,
    sourceId: REF_ID,
  });
  return { capture, requests };
}

describe("Marked ref page", () => {
  it("reads the ref from the page's own API", async () => {
    const { capture, requests } = await harvest({
      status: 200,
      body: { data: markedRef(REF_ID) },
    });
    expect(requests).toEqual([
      { url: "/api/data/getRef", body: JSON.stringify({ args: [REF_ID] }) },
    ]);
    expect(capture?.title).toBe("A scheduling assistant card in a chat");
    expect(capture?.description).toBe(
      "A small assistant card answers a scheduling request with a chosen slot.",
    );
    expect(capture?.author).toEqual({
      name: "Augustas",
      handle: "augustasdesign",
      avatarUrl: "https://marked.dev/seed/avatars/augustasdesign.jpg",
      profileUrl: "https://x.com/augustasdesign",
      verified: true,
    });
    expect(capture?.media).toEqual([
      {
        url: "https://marked.dev/seed/media/x-augustasdesign-2113878354516394052.mp4",
        type: "video",
        posterUrl:
          "https://marked.dev/seed/media/preview/x-augustasdesign-2113878354516394052.jpg",
      },
    ]);
    expect(capture?.upstream).toEqual({
      url: "https://x.com/augustasdesign/status/2113878354516394052",
      host: "x.com",
    });
    expect(capture?.publishedAt).toBe("2026-10-24T06:20:48.000Z");
  });

  it("returns nothing when the ref is private to someone else", async () => {
    const { capture } = await harvest({
      status: 403,
      body: { error: "forbidden" },
    });
    expect(capture).toBeNull();
  });
});
