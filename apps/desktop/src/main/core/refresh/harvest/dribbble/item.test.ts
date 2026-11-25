// @vitest-environment node

import { runInContext } from "node:vm";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { adapt, buildExpression } from "./item";

const SHOT_URL = "https://dribbble.com/shots/24970102-Coming-Soon-Hubano";

const SHOT_DATA = {
  title: "Coming Soon: Hubano",
  postedOn: "2024-10-10T14:02:11Z",
  likesCount: 128,
  viewsCount: 4200,
  commentsCount: 3,
  shotUser: {
    name: "Dan Cederholm",
    username: "simplebits",
    url: "/simplebits",
    avatarUrl: "https://cdn.dribbble.com/users/1/avatars/normal/dan.png",
  },
  contentBlocks: {
    results: [
      {
        contentType: "video",
        position: 2,
        userUploadsAttributes: [
          { originalUrl: "https://cdn.dribbble.com/userupload/2/file/b.mp4" },
        ],
      },
      {
        contentType: "text",
        position: 1,
        content: {
          isShotDescription: true,
          text: {
            content: [
              { content: [{ text: "A sneak peek at " }, { text: "Hubano" }] },
            ],
          },
        },
      },
      {
        contentType: "image",
        position: 0,
        userUploadsAttributes: [
          { originalUrl: "https://cdn.dribbble.com/userupload/1/file/a.png" },
        ],
      },
    ],
  },
};

async function harvest(script: string, head = "") {
  const dom = new JSDOM(
    `<!doctype html><html><head>${head}</head><body><video poster="https://cdn.dribbble.com/userupload/2/file/still.png"></video><script>${script}</script></body></html>`,
    { url: SHOT_URL, runScripts: "dangerously" },
  );
  let now = 0;
  const clock = { now: () => (now += 1000) };
  Object.assign(dom.window, {
    setTimeout: (fn: () => void) => setTimeout(fn, 0),
    Date: Object.assign(dom.window.Date, clock),
  });
  const raw = await runInContext(
    buildExpression("24970102"),
    dom.getInternalVMContext(),
  );
  return adapt(raw, {
    source: "dribbble",
    url: SHOT_URL,
    sourceId: "24970102",
  });
}

describe("Dribbble shot page", () => {
  it("reads the inline shot data with every upload in order", async () => {
    const capture = await harvest(
      `window.Dribbble = { JsConfig: { shotData: ${JSON.stringify(SHOT_DATA)} } };`,
    );
    expect(capture?.title).toBe("Coming Soon: Hubano");
    expect(capture?.description).toBe("A sneak peek at Hubano");
    expect(capture?.author).toMatchObject({
      handle: "simplebits",
      name: "Dan Cederholm",
    });
    expect(capture?.media.map((m) => m.url)).toEqual([
      "https://cdn.dribbble.com/userupload/1/file/a.png",
      "https://cdn.dribbble.com/userupload/2/file/b.mp4",
    ]);
    expect(capture?.media[1]).toMatchObject({
      type: "video",
      posterUrl: "https://cdn.dribbble.com/userupload/2/file/still.png",
    });
    expect(capture?.publishedAt).toBe("2024-10-10T14:02:11.000Z");
    expect(capture?.metrics).toMatchObject({
      likes: 128,
      views: 4200,
      comments: 3,
    });
  });

  it("falls back to the share image when the shot data never loads", async () => {
    const capture = await harvest(
      "",
      '<meta property="og:title" content="Loopie"><meta property="og:image" content="https://cdn.dribbble.com/userupload/3/file/c.png?resize=1600x1200&amp;vertical=center">',
    );
    expect(capture?.title).toBe("Loopie");
    expect(capture?.media.map((m) => m.url)).toEqual([
      "https://cdn.dribbble.com/userupload/3/file/c.png",
    ]);
  });
});
