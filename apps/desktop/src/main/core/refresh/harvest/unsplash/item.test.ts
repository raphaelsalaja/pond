// @vitest-environment node

import { runInContext } from "node:vm";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { adapt, buildExpression } from "./item";

const PHOTO_URL =
  "https://unsplash.com/photos/two-women-in-oversized-shirts-with-files-and-phone-p_1H2gI1-KA";

const ASSET = {
  id: "p_1H2gI1-KA",
  created_at: "2025-10-24T15:47:41Z",
  description: "fashion-oriented office retro aesthetics photo with two women",
  alt_description: "Two women in oversized shirts with files and phone",
  urls: {
    raw: "https://plus.unsplash.com/premium_photo-1761148471869-88f7c43432d3?ixid=NHwxMjA3fDA&ixlib=rb-4.1.0",
  },
  user: {
    username: "lishakov",
    name: "Andrej Lišakov",
    links: { html: "https://unsplash.com/@lishakov" },
    profile_image: { large: "https://images.unsplash.com/profile-1" },
  },
};

async function harvest(reply: { status: number; body?: object }) {
  const dom = new JSDOM(
    `<!doctype html><html><head>
<meta property="og:title" content="Two women in oversized shirts">
<meta property="og:image" content="https://images.unsplash.com/card?mark=logo.png">
</head><body></body></html>`,
    { url: PHOTO_URL, runScripts: "outside-only" },
  );
  const requested: Array<string> = [];
  Object.assign(dom.window, {
    fetch: async (url: string) => {
      requested.push(url);
      return new Response(JSON.stringify(reply.body ?? {}), {
        status: reply.status,
      });
    },
  });
  const raw = await runInContext(
    buildExpression("p_1H2gI1-KA"),
    dom.getInternalVMContext(),
  );
  const capture = adapt(raw, {
    source: "unsplash",
    url: PHOTO_URL,
    sourceId: "p_1H2gI1-KA",
  });
  return { capture, requested };
}

describe("Unsplash photo page", () => {
  it("reads the asset from the page's own API", async () => {
    const { capture, requested } = await harvest({ status: 200, body: ASSET });
    expect(requested).toEqual(["/napi/photos/p_1H2gI1-KA"]);
    expect(capture?.title).toBe(
      "fashion-oriented office retro aesthetics photo with two women",
    );
    expect(capture?.author).toMatchObject({
      handle: "lishakov",
      name: "Andrej Lišakov",
    });
    expect(capture?.media.map((m) => m.url)).toEqual([ASSET.urls.raw]);
    expect(capture?.publishedAt).toBe("2025-10-24T15:47:41Z");
  });

  it("falls back to the share tags when the API refuses", async () => {
    const { capture } = await harvest({ status: 403 });
    expect(capture?.title).toBe("Two women in oversized shirts");
    expect(capture?.media.map((m) => m.url)).toEqual([
      "https://images.unsplash.com/card?mark=logo.png",
    ]);
  });
});
