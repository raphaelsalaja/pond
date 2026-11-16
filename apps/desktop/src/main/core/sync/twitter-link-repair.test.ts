import type { RawJson } from "@pond/schema/raw";
import { describe, expect, it } from "vitest";
import type { BookmarksEntry, RichTweet } from "../refresh/harvest/twitter";
import { repairedCapture } from "./twitter-link-repair";
import { buildTwitterBookmarkSeed } from "./twitter-seed";

function rich(id: string, text: string, quoted?: RichTweet): RichTweet {
  return {
    tweetId: id,
    url: `https://x.com/alice/status/${id}`,
    fullText: text,
    author: { handle: "alice", name: "Alice" },
    media: [],
    metrics: { likes: 0, retweets: 0, replies: 0 },
    quoted,
    raw: {},
  };
}

function entry(text: string, quotedText?: string): BookmarksEntry {
  const quoted = quotedText === undefined ? undefined : rich("2", quotedText);
  return {
    tweetId: "1",
    url: "https://x.com/alice/status/1",
    rich: rich("1", text, quoted),
  };
}

function seeded(text: string, quotedText?: string): RawJson {
  const seed = buildTwitterBookmarkSeed(entry(text, quotedText));
  if (!seed) throw new Error("seed missing");
  return seed.rawJson;
}

describe("repairedCapture", () => {
  it("restores links a synced post lost", () => {
    const stored = seeded("read https://t.co/AbCdEf1234");

    const capture = repairedCapture(stored, entry("read https://example.com"));

    expect(capture?.description).toBe("read https://example.com");
  });

  it("restores links in the quoted post", () => {
    const stored = seeded("look", "via https://t.co/AbCdEf1234");

    const capture = repairedCapture(
      stored,
      entry("look", "via https://example.com"),
    );

    expect(capture?.quoted?.description).toBe("via https://example.com");
  });

  it("leaves a post whose text already matches", () => {
    const stored = seeded("photo https://t.co/Media12345");

    const capture = repairedCapture(
      stored,
      entry("photo https://t.co/Media12345"),
    );

    expect(capture).toBeNull();
  });

  it("leaves a post whose stored text has no short link", () => {
    const stored = seeded("first draft");

    const capture = repairedCapture(stored, entry("edited later"));

    expect(capture).toBeNull();
  });

  it("leaves posts captured from the tweet page", () => {
    const stored = {
      ...seeded("read https://t.co/AbCdEf1234"),
      extractorId: "twitter-tweet",
    };

    const capture = repairedCapture(stored, entry("read https://example.com"));

    expect(capture).toBeNull();
  });
});
