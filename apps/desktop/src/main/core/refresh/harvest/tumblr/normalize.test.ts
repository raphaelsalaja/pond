import { describe, expect, it } from "vitest";
import {
  blogFromUrl,
  captureFromPost,
  parsePosts,
  postEntry,
} from "./normalize";

const LIKED = {
  idString: "178735553447",
  blogName: "pascalcampion",
  summary: "Looking for inspiration #pascalcampion",
  timestamp: 1_538_680_987,
  likedTimestamp: 1_538_681_948,
  noteCount: 1430,
  tags: [],
  blog: { name: "pascalcampion", title: "Pascal Campion" },
  content: [
    {
      type: "image",
      media: [
        {
          url: "https://64.media.tumblr.com/ccbe/tumblr_pg39_1280.jpg",
          width: 970,
          height: 1417,
        },
        {
          url: "https://64.media.tumblr.com/ccbe/tumblr_pg39_640.jpg",
          width: 640,
          height: 935,
        },
      ],
    },
    { type: "text", text: "Looking for inspiration" },
    { type: "text", text: "#pascalcampion" },
  ],
  trail: [],
};

const REBLOG = {
  idString: "644045205583052800",
  blogName: "punkmonksteven",
  likedTimestamp: 1_614_290_185,
  content: [],
  trail: [
    {
      blog: { name: "bryankonietzko" },
      content: [
        {
          type: "video",
          media: { url: "https://va.media.tumblr.com/tumblr_x.mp4" },
          poster: [{ url: "https://64.media.tumblr.com/x_frame1.jpg" }],
        },
        { type: "text", subtype: "heading1", text: "Bryke is back" },
      ],
    },
  ],
};

describe("tumblr normalize", () => {
  it("drops rows that are not posts", () => {
    expect(parsePosts([LIKED, { objectType: "ad" }])).toHaveLength(1);
  });

  it("turns a liked post into a list entry with its liked time", () => {
    const [post] = parsePosts([LIKED]);
    expect(post && postEntry(post)).toEqual({
      sourceId: "178735553447",
      url: "https://www.tumblr.com/pascalcampion/178735553447",
      listKinds: ["liked"],
      savedAt: "2018-10-04T19:39:08.000Z",
      author: "pascalcampion",
      description: "Looking for inspiration\n\n#pascalcampion",
      mediaUrl: "https://64.media.tumblr.com/ccbe/tumblr_pg39_1280.jpg",
      mediaUrls: [
        {
          url: "https://64.media.tumblr.com/ccbe/tumblr_pg39_1280.jpg",
          type: "image",
        },
      ],
      mediaType: "image",
    });
  });

  it("reads a reblog's media and heading from the trail", () => {
    const [post] = parsePosts([REBLOG]);
    const entry = post && postEntry(post);
    expect(entry?.title).toBe("Bryke is back");
    expect(entry?.mediaUrls).toEqual([
      {
        url: "https://va.media.tumblr.com/tumblr_x.mp4",
        type: "video",
        poster: "https://64.media.tumblr.com/x_frame1.jpg",
      },
    ]);
  });

  it("builds a capture with author, date and metrics", () => {
    const [post] = parsePosts([LIKED]);
    const capture = post && captureFromPost(post);
    expect(capture?.author).toEqual({
      name: "Pascal Campion",
      handle: "pascalcampion",
      profileUrl: "https://www.tumblr.com/pascalcampion",
    });
    expect(capture?.publishedAt).toBe("2018-10-04T19:23:07.000Z");
    expect(capture?.metrics).toEqual({ reactions: 1430 });
    expect(capture?.media[0]).toMatchObject({ width: 970, height: 1417 });
  });

  it("reads the blog from either URL form", () => {
    expect(
      blogFromUrl("https://www.tumblr.com/pascalcampion/178735553447/slug"),
    ).toBe("pascalcampion");
    expect(
      blogFromUrl("https://pascalcampion.tumblr.com/post/178735553447"),
    ).toBe("pascalcampion");
    expect(
      blogFromUrl(
        "https://www.tumblr.com/blog/view/pascalcampion/178735553447",
      ),
    ).toBe("pascalcampion");
  });
});
