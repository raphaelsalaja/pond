import { describe, expect, it } from "vitest";
import { instagramParser } from "./instagram";

const SAVED = JSON.stringify({
  saved_saved_media: [
    {
      title: "someone",
      string_map_data: {
        "Saved on": {
          href: "https://www.instagram.com/p/C1aBcDeFgHi/",
          timestamp: 1_700_000_000,
        },
      },
    },
    {
      title: "reel",
      string_map_data: {
        "Saved on": {
          href: "https://www.instagram.com/reel/C2xYz/",
          timestamp: 1_700_000_100,
        },
      },
    },
    {
      title: "profile",
      string_map_data: {
        "Saved on": {
          href: "https://www.instagram.com/someone/",
          timestamp: 1,
        },
      },
    },
  ],
});

const LIKED = JSON.stringify({
  likes_media_likes: [
    {
      title: "a",
      string_list_data: [
        {
          href: "https://www.instagram.com/p/C3Lk/",
          value: "👍",
          timestamp: 1_700_000_200,
        },
      ],
    },
  ],
});

describe("instagramParser", () => {
  it("matches saved and liked post files", () => {
    expect(
      instagramParser.matches("your_instagram_activity/saved/saved_posts.json"),
    ).toBe(true);
    expect(instagramParser.matches("likes/liked_posts.json")).toBe(true);
    expect(instagramParser.matches("saved_posts.csv")).toBe(false);
  });

  it("reads post and reel links with dates, skipping profiles", () => {
    expect(instagramParser.parse("saved/saved_posts.json", SAVED)).toEqual([
      {
        url: "https://www.instagram.com/p/C1aBcDeFgHi/",
        listKind: "saved",
        savedAt: new Date(1_700_000_000 * 1000),
      },
      {
        url: "https://www.instagram.com/reel/C2xYz/",
        listKind: "saved",
        savedAt: new Date(1_700_000_100 * 1000),
      },
    ]);
    expect(instagramParser.parse("likes/liked_posts.json", LIKED)).toEqual([
      {
        url: "https://www.instagram.com/p/C3Lk/",
        listKind: "liked",
        savedAt: new Date(1_700_000_200 * 1000),
      },
    ]);
  });

  it("returns nothing for text that isn't JSON", () => {
    expect(instagramParser.parse("saved/saved_posts.json", "nope")).toEqual([]);
  });
});
