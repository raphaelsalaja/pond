import { describe, expect, it } from "vitest";
import { parseBookmarksResponses } from "./graphql";

function tweetEntry(
  id: string,
  handle: string,
  text: string,
  extra: { legacy?: object; node?: object } = {},
) {
  return {
    entryId: `tweet-${id}`,
    content: {
      entryType: "TimelineTimelineItem",
      itemContent: {
        __typename: "TimelineTweet",
        tweet_results: {
          result: {
            __typename: "Tweet",
            rest_id: id,
            legacy: {
              id_str: id,
              full_text: text,
              favorite_count: 3,
              retweet_count: 1,
              reply_count: 0,
              ...extra.legacy,
            },
            ...extra.node,
            core: {
              user_results: {
                result: {
                  core: { screen_name: handle, name: handle },
                },
              },
            },
          },
        },
      },
    },
  };
}

function fullTextOf(entry: ReturnType<typeof tweetEntry>) {
  const rich = parseBookmarksResponses([
    {
      url: "https://x.com/i/api/graphql/abc/Bookmarks",
      body: JSON.stringify({
        data: {
          bookmark_timeline_v2: {
            timeline: {
              instructions: [{ type: "TimelineAddEntries", entries: [entry] }],
            },
          },
        },
      }),
    },
  ]);
  return rich.get("333")?.fullText;
}

describe("parseBookmarksResponses", () => {
  it("reads tweets from a Bookmarks envelope", () => {
    const rich = parseBookmarksResponses([
      {
        url: "https://x.com/i/api/graphql/abc/Bookmarks",
        body: JSON.stringify({
          data: {
            bookmark_timeline_v2: {
              timeline: {
                instructions: [
                  {
                    type: "TimelineAddEntries",
                    entries: [tweetEntry("111", "alice", "bookmarked")],
                  },
                ],
              },
            },
          },
        }),
      },
    ]);
    expect(rich.get("111")?.fullText).toBe("bookmarked");
    expect(rich.get("111")?.author.handle).toBe("alice");
  });

  it("reads tweets from a Likes timeline envelope", () => {
    const rich = parseBookmarksResponses([
      {
        url: "https://x.com/i/api/graphql/xyz/Likes",
        body: JSON.stringify({
          data: {
            user: {
              result: {
                timeline_v2: {
                  timeline: {
                    instructions: [
                      {
                        type: "TimelineAddEntries",
                        entries: [tweetEntry("222", "bob", "liked")],
                      },
                    ],
                  },
                },
              },
            },
          },
        }),
      },
    ]);
    expect(rich.get("222")?.fullText).toBe("liked");
    expect(rich.get("222")?.url).toBe("https://x.com/bob/status/222");
  });

  describe("tweet text links", () => {
    it("replaces t.co wrappers with the expanded link", () => {
      const entry = tweetEntry("333", "carol", "read https://t.co/AbCdEf1234", {
        legacy: {
          entities: {
            urls: [
              {
                url: "https://t.co/AbCdEf1234",
                expanded_url: "https://example.com/post",
              },
            ],
          },
        },
      });

      const text = fullTextOf(entry);

      expect(text).toBe("read https://example.com/post");
    });

    it("keeps the quoted tweet permalink as t.co so the card hides it", () => {
      const entry = tweetEntry(
        "333",
        "carol",
        "so true https://t.co/Quoted1234",
        {
          legacy: {
            entities: {
              urls: [
                {
                  url: "https://t.co/Quoted1234",
                  expanded_url: "https://x.com/dave/status/9",
                },
              ],
            },
            quoted_status_permalink: { url: "https://t.co/Quoted1234" },
          },
        },
      );

      const text = fullTextOf(entry);

      expect(text).toBe("so true https://t.co/Quoted1234");
    });

    it("expands links in long-form note tweets", () => {
      const entry = tweetEntry("333", "carol", "truncated", {
        node: {
          note_tweet: {
            note_tweet_results: {
              result: {
                text: "long post https://t.co/NoteLink12",
                entity_set: {
                  urls: [
                    {
                      url: "https://t.co/NoteLink12",
                      expanded_url: "https://example.com/long",
                    },
                  ],
                },
              },
            },
          },
        },
      });

      const text = fullTextOf(entry);

      expect(text).toBe("long post https://example.com/long");
    });
  });
});
