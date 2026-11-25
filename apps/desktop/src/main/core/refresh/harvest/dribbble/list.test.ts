// @vitest-environment node

import { runInContext } from "node:vm";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";
import { buildDribbbleListExpression, dribbbleLikesUrl } from "./list";

function imageShot(id: number): string {
  return `<li id="screenshot-${id}" data-thumbnail-id="${id}" class="shot-thumbnail js-thumbnail shot-thumbnail-container">
  <div class="js-thumbnail-base shot-thumbnail-base dribbble-shot dribbble">
    <figure class="js-thumbnail-placeholder shot-thumbnail-placeholder">
      <img alt="Coming Soon" data-src="https://cdn.dribbble.com/userupload/${id}/file/original-fb43.jpg?format=webp&amp;resize=400x300&amp;vertical=center" class="lazyload" src="data:image/gif;base64,R0lGOD" />
    </figure>
    <a class="shot-thumbnail-link dribbble-link js-shot-link" href="/shots/${id}-Coming-Soon-Hubano"><span class="accessibility-text">View Coming Soon</span></a>
    <div class="shot-thumbnail-overlay"><div class="shot-thumbnail-overlay-content"><div class="shot-title">Coming Soon: Hubano</div></div></div>
  </div>
  <div class="shot-details-container"><div class="user-information">
    <a class="hover-card-parent hoverable url" rel="contact" href="/simplebits"><span class="display-name">Dan Cederholm</span></a>
  </div></div>
</li>`;
}

const VIDEO_SHOT = `<li id="screenshot-27838898" data-thumbnail-id="27838898" class="shot-thumbnail js-thumbnail">
  <div class="js-thumbnail-base shot-thumbnail-base dribbble-shot dribbble video"
    data-video-teaser-large="https://cdn.dribbble.com/userupload/49429685/file/large-a4c4.mp4">
    <figure class="js-thumbnail-placeholder shot-thumbnail-placeholder">
      <img alt="Loopie" data-animated-url="https://cdn.dribbble.com/userupload/49429685/file/8e51.mp4" src="https://cdn.dribbble.com/userupload/49429685/file/still-6f4c.png?format=webp&amp;resize=400x300&amp;vertical=center">
    </figure>
    <a class="shot-thumbnail-link" href="/shots/27838898-Loopie"></a>
  </div>
</li>`;

function page(ids: Array<number>): string {
  return `${ids.map(imageShot).join("\n")}<script>var newestShots = [];</script>`;
}

const FIRST = Array.from({ length: 24 }, (_, i) => 1000 - i);

interface Reply {
  status: number;
  body?: string;
}

async function walk(
  args: Partial<ListHarvestArgs>,
  replies: Map<string, Array<Reply>>,
): Promise<{ result: ListHarvestResult; requested: Array<string> }> {
  const dom = new JSDOM("<!doctype html><body class='logged-in'></body>", {
    url: dribbbleLikesUrl("simplebits"),
    runScripts: "outside-only",
  });
  const requested: Array<string> = [];
  Object.assign(dom.window, {
    setTimeout: (fn: () => void) => setTimeout(fn, 0),
    fetch: async (url: string) => {
      const pageNo = new URL(url, "https://dribbble.com").searchParams.get(
        "page",
      );
      requested.push(pageNo ?? "");
      const reply = replies.get(pageNo ?? "")?.shift() ?? {
        status: 200,
        body: "",
      };
      return new Response(reply.body ?? "", { status: reply.status });
    },
  });
  const result: ListHarvestResult = await runInContext(
    buildDribbbleListExpression({ knownIds: [], ...args }),
    dom.getInternalVMContext(),
  );
  return { result, requested };
}

function ids(result: ListHarvestResult): Array<string> {
  return result.ok ? result.entries.map((entry) => entry.sourceId) : [];
}

describe("Dribbble likes walk", () => {
  it("reads full pages until a short one and marks every entry liked", async () => {
    const { result } = await walk(
      {},
      new Map([
        ["1", [{ status: 200, body: page(FIRST) }]],
        ["2", [{ status: 200, body: `${page([7, 6])}${VIDEO_SHOT}` }]],
      ]),
    );
    expect(ids(result)).toHaveLength(27);
    expect(result).toMatchObject({ ok: true, reachedEnd: true });
    expect(result.ok && result.entries[0]).toEqual({
      sourceId: "1000",
      url: "https://dribbble.com/shots/1000-Coming-Soon-Hubano",
      title: "Coming Soon: Hubano",
      author: "Dan Cederholm",
      mediaUrl:
        "https://cdn.dribbble.com/userupload/1000/file/original-fb43.jpg",
      mediaUrls: [
        {
          url: "https://cdn.dribbble.com/userupload/1000/file/original-fb43.jpg",
          type: "image",
        },
      ],
      mediaType: "image",
      listKinds: ["liked"],
    });
  });

  it("keeps the full mp4 for an animated shot with its still as poster", async () => {
    const { result } = await walk(
      {},
      new Map([["1", [{ status: 200, body: VIDEO_SHOT }]]]),
    );
    expect(result.ok && result.entries[0]).toMatchObject({
      sourceId: "27838898",
      mediaType: "video",
      mediaUrl: "https://cdn.dribbble.com/userupload/49429685/file/8e51.mp4",
      mediaUrls: [
        {
          url: "https://cdn.dribbble.com/userupload/49429685/file/8e51.mp4",
          type: "video",
          poster:
            "https://cdn.dribbble.com/userupload/49429685/file/still-6f4c.png",
        },
      ],
    });
  });

  it("retries a page the bot wall answers with 202", async () => {
    const { result, requested } = await walk(
      {},
      new Map([["1", [{ status: 202 }, { status: 200, body: page([5, 4]) }]]]),
    );
    expect(ids(result)).toEqual(["5", "4"]);
    expect(requested).toEqual(["1", "1"]);
  });

  it("stops after two pages of shots it already has", async () => {
    const second = FIRST.map((id) => id - 100);
    const { result, requested } = await walk(
      { knownIds: [...FIRST, ...second].map(String) },
      new Map([
        ["1", [{ status: 200, body: page(FIRST) }]],
        ["2", [{ status: 200, body: page(second) }]],
        ["3", [{ status: 200, body: page([1]) }]],
      ]),
    );
    expect(requested).toEqual(["1", "2"]);
    expect(result).toMatchObject({ ok: true, reachedEnd: true });
  });

  it("resumes at the page a timed-out run stopped on", async () => {
    const { result, requested } = await walk(
      { resumeCursor: "3" },
      new Map([["3", [{ status: 200, body: page([9]) }]]]),
    );
    expect(requested).toEqual(["3"]);
    expect(ids(result)).toEqual(["9"]);
  });

  it("reports a signed-out session", async () => {
    const { result } = await walk({}, new Map([["1", [{ status: 401 }]]]));
    expect(result).toEqual({ ok: false, reason: "auth_required" });
  });
});
