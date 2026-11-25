import type { JsonObject } from "@pond/schema/json";
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
    function fullTextOf(entry: ReturnType<typeof tweetEntry>) {
      const rich = parseBookmarksResponses([
        {
          url: "https://x.com/i/api/graphql/abc/Bookmarks",
          body: JSON.stringify({
            data: {
              bookmark_timeline_v2: {
                timeline: {
                  instructions: [
                    { type: "TimelineAddEntries", entries: [entry] },
                  ],
                },
              },
            },
          }),
        },
      ]);
      return rich.get("333")?.fullText;
    }

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

  describe("x-web responses", () => {
    function xwebTweet(
      id: string,
      handle: string,
      text: string,
      extra: JsonObject = {},
    ) {
      return {
        __typename: "Tweet",
        rest_id: id,
        core: {
          user_results: {
            result: {
              __typename: "User",
              avatar: {
                image_url: `https://pbs.twimg.com/profile_images/1/${handle}_normal.jpg`,
              },
              core: { name: handle.toUpperCase(), screen_name: handle },
            },
          },
        },
        counts: {
          bookmark_count: 4,
          favorite_count: 30,
          quote_count: 2,
          reply_count: 5,
          retweet_count: 7,
        },
        details: { created_at_ms: Date.UTC(2026, 10, 20), full_text: text },
        legacy: { conversation_id_str: id, entities: {}, lang: "en" },
        media_entities2: [],
        url_entities: [],
        views: { count: "900" },
        ...extra,
      };
    }

    function xwebEntry(tweet: ReturnType<typeof xwebTweet>) {
      return {
        entry_id: `tweet-${tweet.rest_id}`,
        sort_index: "1",
        content: {
          __typename: "TimelineTimelineItem",
          content: {
            __typename: "TimelineTweet",
            tweet_results: { rest_id: tweet.rest_id, result: tweet },
          },
        },
      };
    }

    const cursor = {
      entry_id: "cursor-bottom-1",
      sort_index: "0",
      content: {
        __typename: "TimelineTimelineCursor",
        cursor_type: "Bottom",
        value: "NEXT",
      },
    };

    function timeline(entries: JsonObject[]) {
      return {
        timeline: {
          id: "t",
          instructions: [{ __typename: "TimelineAddEntries", entries }],
        },
      };
    }

    function parse(data: JsonObject) {
      return parseBookmarksResponses([
        {
          url: "https://api.x.com/graphql/abc/BookmarkTimeline",
          body: JSON.stringify({ data }),
        },
      ]);
    }

    it("reads a BookmarkTimeline page", () => {
      const tweet = xwebTweet("501", "erin", "read https://t.co/Link123456", {
        url_entities: [
          {
            url: "https://t.co/Link123456",
            expanded_url: "https://example.com/a",
          },
        ],
        media_entities2: [
          {
            type: "photo",
            media_url_https: "https://pbs.twimg.com/media/Photo1.jpg",
            original_info: { width: 1200, height: 800 },
          },
          {
            type: "video",
            media_url_https: "https://pbs.twimg.com/media/Poster1.jpg",
            original_info: { width: 1280, height: 720 },
            video_info: {
              duration_millis: 9000,
              variants: [
                {
                  content_type: "application/x-mpegURL",
                  url: "https://video.twimg.com/v/pl.m3u8",
                },
                {
                  bitrate: 832000,
                  content_type: "video/mp4",
                  url: "https://video.twimg.com/v/low.mp4",
                },
                {
                  bitrate: 2176000,
                  content_type: "video/mp4",
                  url: "https://video.twimg.com/v/high.mp4",
                },
              ],
            },
          },
        ],
      });

      const rich = parse({
        bookmark_timeline_v2: timeline([xwebEntry(tweet), cursor]),
      }).get("501");

      expect(rich).toMatchObject({
        tweetId: "501",
        url: "https://x.com/erin/status/501",
        fullText: "read https://example.com/a",
        publishedAt: "2026-11-20T00:00:00.000Z",
        author: {
          handle: "erin",
          name: "ERIN",
          avatarUrl: "https://pbs.twimg.com/profile_images/1/erin_400x400.jpg",
        },
        metrics: {
          likes: 30,
          retweets: 7,
          replies: 5,
          quotes: 2,
          bookmarks: 4,
          views: 900,
        },
        media: [
          {
            type: "image",
            url: "https://pbs.twimg.com/media/Photo1.jpg?name=orig",
            width: 1200,
            height: 800,
          },
          {
            type: "video",
            url: "https://video.twimg.com/v/high.mp4",
            poster: "https://pbs.twimg.com/media/Poster1.jpg?name=orig",
            durationSec: 9,
          },
        ],
      });
    });

    it("reads a likesQuery page", () => {
      const rich = parse({
        user_result_by_rest_id: {
          result: {
            __typename: "User",
            favorites_by_time_timeline_v2: timeline([
              xwebEntry(xwebTweet("502", "finn", "liked")),
            ]),
          },
        },
      });

      expect(rich.get("502")?.fullText).toBe("liked");
    });

    it("keeps the quoted post and the reply parent", () => {
      const quoted = xwebTweet("600", "gus", "original");
      const tweet = xwebTweet("601", "hana", "quoting", {
        quoted_tweet_results: { rest_id: "600", result: quoted },
        reply_to_results: { rest_id: "599" },
        reply_to_user_results: {
          rest_id: "9",
          result: { __typename: "User", core: { screen_name: "ivan" } },
        },
      });

      const rich = parse({
        bookmark_timeline_v2: timeline([xwebEntry(tweet)]),
      }).get("601");

      expect(rich?.quoted?.fullText).toBe("original");
      expect(rich?.quoted?.author.handle).toBe("gus");
      expect(rich?.replyTo).toEqual({
        tweetId: "599",
        url: "https://x.com/ivan/status/599",
        handle: "ivan",
      });
    });

    it("unwraps posts with visibility results", () => {
      const rich = parse({
        bookmark_timeline_v2: timeline([
          {
            ...xwebEntry(xwebTweet("700", "jo", "x")),
            content: {
              __typename: "TimelineTimelineItem",
              content: {
                __typename: "TimelineTweet",
                tweet_results: {
                  result: {
                    __typename: "TweetWithVisibilityResults",
                    tweet: xwebTweet("700", "jo", "limited"),
                  },
                },
              },
            },
          },
        ]),
      });

      expect(rich.get("700")?.fullText).toBe("limited");
    });

    it("reads a post page's TweetResultByRestId response", () => {
      const rich = parseBookmarksResponses([
        {
          url: "https://api.x.com/graphql/abc/TweetResultByRestId",
          body: JSON.stringify({
            data: {
              tweet_result_by_rest_id: {
                rest_id: "800",
                result: xwebTweet("800", "kai", "the post"),
              },
            },
          }),
        },
      ]);

      expect(rich.get("800")?.fullText).toBe("the post");
    });

    it("reads the focal post from a TweetDetail response", () => {
      const rich = parseBookmarksResponses([
        {
          url: "https://api.x.com/graphql/abc/TweetDetail",
          body: JSON.stringify({
            data: {
              threaded_conversation_with_injections_v2: {
                instructions: [
                  { __typename: "TimelineClearCache" },
                  {
                    __typename: "TimelineAddEntries",
                    entries: [xwebEntry(xwebTweet("900", "lou", "focal"))],
                  },
                ],
              },
            },
          }),
        },
      ]);

      expect(rich.get("900")?.author.handle).toBe("lou");
    });
  });
});
