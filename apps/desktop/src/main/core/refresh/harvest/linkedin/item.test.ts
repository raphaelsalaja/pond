// @vitest-environment node

import { runInContext } from "node:vm";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { POST_ID, POST_PAGE } from "./fixture";
import { adapt, buildExpression } from "./item";

const POST_URL = `https://www.linkedin.com/feed/update/urn:li:activity:${POST_ID}/`;

const SHARE_TAGS = `<meta property="og:title" content="Shipping our new design system today.">
<meta property="og:image" content="https://media.licdn.com/dms/image/v2/share/0">`;

async function harvest(body: string, url = POST_URL) {
  const dom = new JSDOM(
    `<!doctype html><html><head>${SHARE_TAGS}</head><body>${body}</body></html>`,
    { url, runScripts: "outside-only" },
  );
  Object.assign(dom.window, {
    setTimeout: (fn: () => void) => setTimeout(fn, 0),
  });
  const raw = await runInContext(
    buildExpression(POST_ID),
    dom.getInternalVMContext(),
  );
  return adapt(raw, { source: "linkedin", url: POST_URL, sourceId: POST_ID });
}

describe("LinkedIn post page", () => {
  it("reads the author, text and images of the rendered post", async () => {
    const capture = await harvest(POST_PAGE);
    expect(capture?.title).toBe("Shipping our new design system today.");
    expect(capture?.description).toBe(
      "Shipping our new design system today.\nHere's what we learned.",
    );
    expect(capture?.author).toEqual({
      handle: "janedoe",
      name: "Jane Doe",
      avatarUrl:
        "https://media.licdn.com/dms/image/v2/C4D03AQ/profile-displayphoto-shrink_100_100/0",
      profileUrl: "https://www.linkedin.com/in/janedoe/",
    });
    expect(capture?.media.map((m) => m.url)).toEqual([
      "https://media.licdn.com/dms/image/v2/D4E22AQ/feedshare-shrink_2048_1536/1",
      "https://media.licdn.com/dms/image/v2/D4E22AQ/feedshare-shrink_2048_1536/2",
    ]);
    expect(capture?.publishedAt).toBe("2024-06-28T06:46:48.752Z");
  });

  it("falls back to the share tags when no post renders", async () => {
    const capture = await harvest("");
    expect(capture?.title).toBe("Shipping our new design system today.");
    expect(capture?.media.map((m) => m.url)).toEqual([
      "https://media.licdn.com/dms/image/v2/share/0",
    ]);
  });

  it("gives up on a checkpoint", async () => {
    const capture = await harvest(
      POST_PAGE,
      "https://www.linkedin.com/checkpoint/challenge/AgF",
    );
    expect(capture).toBeNull();
  });
});
