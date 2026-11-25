import { describe, expect, it } from "vitest";
import { adapt } from "./item";

const ctx = {
  source: "twitter" as const,
  url: "https://x.com/i/web/status/42",
  sourceId: "42",
};

const tweetResultByRestId = JSON.stringify({
  data: {
    tweet_result_by_rest_id: {
      rest_id: "42",
      result: {
        __typename: "Tweet",
        rest_id: "42",
        core: {
          user_results: {
            result: {
              __typename: "User",
              avatar: {
                image_url:
                  "https://pbs.twimg.com/profile_images/1/mo_normal.jpg",
              },
              core: { name: "Mo", screen_name: "mo" },
            },
          },
        },
        counts: { favorite_count: 12, retweet_count: 3, reply_count: 1 },
        details: {
          created_at_ms: Date.UTC(2026, 10, 24, 9),
          full_text: "A post from the new client",
        },
        legacy: { entities: {}, lang: "en" },
        media_entities2: [
          {
            type: "photo",
            media_url_https: "https://pbs.twimg.com/media/Pic.jpg",
          },
        ],
        url_entities: [],
      },
    },
  },
});

describe("adapt", () => {
  it("builds the Capture from the post page's GraphQL response", () => {
    const capture = adapt({ tweetResponses: [tweetResultByRestId] }, ctx);

    expect(capture).toMatchObject({
      title: "A post from the new client",
      publishedAt: "2026-11-24T09:00:00.000Z",
      author: {
        handle: "mo",
        name: "Mo",
        avatarUrl: "https://pbs.twimg.com/profile_images/1/mo_400x400.jpg",
      },
      metrics: { likes: 12, retweets: 3, replies: 1 },
      media: [
        {
          type: "image",
          url: "https://pbs.twimg.com/media/Pic.jpg?name=orig",
        },
      ],
    });
  });

  it("returns nothing when the response is for another post", () => {
    expect(
      adapt(
        { tweetResponses: [tweetResultByRestId] },
        { ...ctx, sourceId: "7" },
      ),
    ).toBeNull();
  });
});
