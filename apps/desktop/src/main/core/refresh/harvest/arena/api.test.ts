import type { Capture } from "@pond/schema/raw";
import { describe, expect, it, vi } from "vitest";
import { TerminalError } from "../../../pipeline/extractors/errors";
import {
  type ArenaBlock,
  fetchArenaCapture,
  withLinkedPageCapture,
} from "./api";

const LINKED = "https://en.wikipedia.org/wiki/Community_Memory";
const ARENA_SHOT =
  "https://d2w9rnfcy7mm78.cloudfront.net/2824521/original_b395a961.png";
const PAGE_COVER = "https://upload.wikimedia.org/community-memory.jpg";
const FAVICON = "https://en.wikipedia.org/favicon.ico";

const linkBlock: ArenaBlock = {
  id: 2824521,
  class: "Link",
  title: "Community Memory",
  generated_title: "Community Memory - Wikipedia",
  description: "The first public bulletin board.",
  content: "",
  created_at: "2018-10-05T16:27:00.086Z",
  image: { original: { url: ARENA_SHOT, width: 1200, height: 900 } },
  user: { full_name: "Ada", slug: "ada" },
  source: { url: LINKED },
  channels: [{ id: 42, title: "Influences", slug: "influences" }],
};

function page(overrides: Partial<Capture> = {}): Capture {
  return {
    id: LINKED,
    source: "web",
    url: LINKED,
    title: "Community Memory - Wikipedia",
    description: "Community Memory was a bulletin board.",
    media: [{ url: PAGE_COVER, type: "image" }],
    extras: { publisher: "Wikipedia", faviconUrl: FAVICON },
    ...overrides,
  };
}

function deps(
  block: ArenaBlock,
  extractPage: (url: URL) => Promise<Capture> = async () => page(),
) {
  return {
    fetchBlock: vi.fn(async () => ({ ok: true as const, value: block })),
    extractPage: vi.fn(extractPage),
  };
}

describe("Are.na Link blocks", () => {
  it("saves a Link block as the page it links to, keeping the block's provenance", async () => {
    const d = deps(linkBlock);

    const result = await fetchArenaCapture({ sourceId: "2824521" }, d);

    expect(d.extractPage.mock.calls.map(([url]) => url.href)).toEqual([LINKED]);
    expect(result).toEqual({
      ok: true,
      capture: expect.objectContaining({
        id: "2824521",
        source: "arena",
        url: LINKED,
        title: "Community Memory",
        description: "The first public bulletin board.",
        author: {
          name: "Ada",
          handle: "ada",
          profileUrl: "https://www.are.na/ada",
        },
        media: [{ url: PAGE_COVER, type: "image" }],
        extras: {
          blockClass: "Link",
          channels: [{ id: "42", title: "Influences", slug: "influences" }],
          publisher: "Wikipedia",
          faviconUrl: FAVICON,
        },
      }),
    });
  });

  it("fills a blank title and description from the page", async () => {
    const d = deps({
      ...linkBlock,
      title: "",
      generated_title: "",
      description: "",
    });

    const result = await fetchArenaCapture({ sourceId: "2824521" }, d);

    expect(result).toMatchObject({
      ok: true,
      capture: {
        title: "Community Memory - Wikipedia",
        description: "Community Memory was a bulletin board.",
      },
    });
  });

  it("keeps Are.na's screenshot when the page only offers its favicon", async () => {
    const d = deps(linkBlock, async () =>
      page({ media: [{ url: FAVICON, type: "image" }] }),
    );

    const result = await fetchArenaCapture({ sourceId: "2824521" }, d);

    expect(result).toMatchObject({
      ok: true,
      capture: {
        url: LINKED,
        media: [{ url: ARENA_SHOT, type: "image", width: 1200, height: 900 }],
      },
    });
  });

  it("keeps the block's preview when the linked page can't be read", async () => {
    const d = deps(linkBlock, async () => {
      throw new TerminalError("web fetch 404");
    });

    const result = await fetchArenaCapture({ sourceId: "2824521" }, d);

    expect(result).toMatchObject({
      ok: true,
      capture: {
        source: "arena",
        url: LINKED,
        title: "Community Memory",
        media: [{ url: ARENA_SHOT, type: "image" }],
        extras: { blockClass: "Link" },
      },
    });
  });

  it("stops instead of falling back when the harvest is cancelled", async () => {
    const controller = new AbortController();
    const d = deps(linkBlock, async () => {
      controller.abort();
      throw new Error("aborted");
    });

    await expect(
      fetchArenaCapture({ sourceId: "2824521", signal: controller.signal }, d),
    ).rejects.toThrow();
  });

  it("does not read a Link block's page when it points back at are.na", async () => {
    const d = deps({
      ...linkBlock,
      source: { url: "https://www.are.na/ada/influences" },
    });

    await fetchArenaCapture({ sourceId: "2824521" }, d);

    expect(d.extractPage).not.toHaveBeenCalled();
  });
});

describe("other Are.na blocks", () => {
  it("leaves an Image block's mapping alone and never reads its source page", async () => {
    const d = deps({
      id: 29774986,
      class: "Image",
      title: "Group show",
      image: { original: { url: ARENA_SHOT, width: 800, height: 600 } },
      source: { url: "https://gallery98.org/2022/group-show/" },
    });

    const result = await fetchArenaCapture({ sourceId: "29774986" }, d);

    expect(d.extractPage).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      capture: {
        id: "29774986",
        url: "https://gallery98.org/2022/group-show/",
        media: [{ url: ARENA_SHOT, type: "image", width: 800, height: 600 }],
        extras: { blockClass: "Image" },
      },
    });
  });

  it("keeps a Text block on its Are.na page", async () => {
    const d = deps({
      id: 4929062,
      class: "Text",
      content: "A note to self.",
    });

    const result = await fetchArenaCapture({ sourceId: "4929062" }, d);

    expect(d.extractPage).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      capture: {
        url: "https://www.are.na/block/4929062",
        description: "A note to self.",
        media: [],
        extras: { blockClass: "Text" },
      },
    });
  });

  it("converts a stored Link capture by reading only its page", async () => {
    const stored: Capture = {
      id: "2824521",
      source: "arena",
      url: LINKED,
      title: "Community Memory",
      media: [{ url: ARENA_SHOT, type: "image" }],
      extras: { blockClass: "Link" },
    };
    const extractPage = vi.fn(async () => page());

    const capture = await withLinkedPageCapture(stored, undefined, extractPage);

    expect(extractPage).toHaveBeenCalledOnce();
    expect(capture).toMatchObject({
      source: "arena",
      url: LINKED,
      title: "Community Memory",
      media: [{ url: PAGE_COVER }],
      extras: { blockClass: "Link", publisher: "Wikipedia" },
    });
  });
});
