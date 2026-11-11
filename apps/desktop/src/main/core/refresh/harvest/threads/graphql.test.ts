import { describe, expect, it } from "vitest";
import { buildThreadsSavedSeed } from "../../../sync/threads-seed";
import { parseSavedResponses, richThreadFromNode } from "./graphql";

const quotedNode = {
  code: "QuotedCode01",
  caption: { text: "original thought" },
  like_count: 4,
  taken_at: 1_700_000_000,
  user: {
    username: "carol",
    full_name: "Carol",
    profile_pic_url: "https://example.com/c.jpg",
  },
  image_versions2: {
    candidates: [
      { url: "https://cdn.example.com/quoted.jpg", width: 400, height: 400 },
    ],
  },
  text_post_app_info: {
    direct_reply_count: 0,
    quote_count: 0,
    repost_count: 0,
  },
};

const parentNode = {
  code: "ParentCode01",
  caption: { text: "check this out" },
  like_count: 12,
  taken_at: 1_700_000_100,
  user: {
    username: "alice",
    full_name: "Alice",
    profile_pic_url: "https://example.com/a.jpg",
    is_verified: true,
  },
  image_versions2: {
    candidates: [
      { url: "https://cdn.example.com/parent.jpg", width: 800, height: 800 },
    ],
  },
  text_post_app_info: {
    direct_reply_count: 3,
    quote_count: 1,
    repost_count: 2,
    share_info: { quoted_post: quotedNode },
    link_preview_attachment: {
      url: "https://www.example.com/article",
      display_url: "example.com",
      title: "An article",
      description: "About something",
      image_url: "https://cdn.example.com/og.jpg",
    },
  },
};

const savedPayload = {
  data: {
    mediaData: {
      edges: [
        {
          node: {
            thread_items: [{ post: parentNode }],
          },
        },
      ],
      page_info: { has_next_page: false, end_cursor: "cursor-end" },
    },
  },
};

describe("parseSavedResponses", () => {
  it("reads posts, quotes, and cards from a saved-feed payload", () => {
    const rich = parseSavedResponses([
      {
        url: "https://www.threads.com/graphql/query",
        body: JSON.stringify(savedPayload),
      },
    ]);
    expect(rich.size).toBe(1);
    const post = rich.get("ParentCode01");
    expect(post).toMatchObject({
      postId: "ParentCode01",
      url: "https://www.threads.com/@alice/post/ParentCode01",
      fullText: "check this out",
      author: { handle: "alice", name: "Alice", verified: true },
    });
    expect(post?.media[0]?.url).toBe("https://cdn.example.com/parent.jpg");
    expect(post?.quoted?.postId).toBe("QuotedCode01");
    expect(post?.quoted?.media[0]?.url).toBe(
      "https://cdn.example.com/quoted.jpg",
    );
    expect(post?.card).toMatchObject({
      url: "https://www.example.com/article",
      domain: "example.com",
      title: "An article",
    });
    expect(rich.has("QuotedCode01")).toBe(false);
  });

  it("reads every page of a paged saved feed and skips a broken one", () => {
    const nextPage = {
      data: {
        mediaData: {
          edges: [
            {
              node: {
                thread_items: [
                  { post: { ...quotedNode, code: "SecondPage1" } },
                ],
              },
            },
          ],
          page_info: { has_next_page: false, end_cursor: null },
        },
      },
    };
    const rich = parseSavedResponses([
      {
        url: "https://www.threads.com/graphql/query",
        body: JSON.stringify(savedPayload),
        status: 200,
      },
      {
        url: "https://www.threads.com/graphql/query",
        body: "<html>Something went wrong</html>",
        status: 200,
      },
      {
        url: "https://www.threads.com/graphql/query",
        body: JSON.stringify(nextPage),
        status: 200,
      },
    ]);
    expect([...rich.keys()]).toEqual(["ParentCode01", "SecondPage1"]);
    expect(rich.get("SecondPage1")?.author.handle).toBe("carol");
  });

  it("parses bodies with an anti-hijack prefix", () => {
    const rich = parseSavedResponses([
      {
        url: "https://www.threads.com/graphql/query",
        body: `for (;;);${JSON.stringify(savedPayload)}`,
      },
    ]);
    expect(rich.has("ParentCode01")).toBe(true);
  });
});

describe("buildThreadsSavedSeed", () => {
  it("writes quoted Capture, card, and quote media on the quoted item", () => {
    const rich = richThreadFromNode(parentNode);
    expect(rich).not.toBeNull();
    const seed = buildThreadsSavedSeed({
      postId: "ParentCode01",
      url: "https://www.threads.com/@alice/post/ParentCode01",
      rich: rich ?? undefined,
    });
    expect(seed?.rawJson.extractorId).toBe("threads-saved-seed");
    const capture = seed?.rawJson.capture;
    expect(capture?.quoted).toMatchObject({
      id: "QuotedCode01",
      url: "https://www.threads.com/@carol/post/QuotedCode01",
      description: "original thought",
    });
    expect(capture?.card).toMatchObject({
      url: "https://www.example.com/article",
      title: "An article",
    });
    expect(capture?.media.map((m) => m.url)).toEqual([
      "https://cdn.example.com/parent.jpg",
    ]);
    expect(capture?.quoted?.media.map((m) => m.url)).toEqual([
      "https://cdn.example.com/quoted.jpg",
    ]);
  });
});
