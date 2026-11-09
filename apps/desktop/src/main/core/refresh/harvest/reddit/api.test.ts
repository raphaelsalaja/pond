import { describe, expect, it } from "vitest";
import {
  avatarFromMeJson,
  entriesFromListing,
  handleFromMeJson,
  RedditListingSchema,
  redditListingUrl,
} from "./listing";

describe("handleFromMeJson", () => {
  it("reads the logged-in username", () => {
    expect(handleFromMeJson({ kind: "t2", data: { name: "spez" } })).toBe(
      "spez",
    );
  });

  it("returns null for logged-out payloads", () => {
    expect(handleFromMeJson({})).toBeNull();
    expect(handleFromMeJson({ data: {} })).toBeNull();
  });

  it("reads icon_img from me.json", () => {
    expect(
      avatarFromMeJson({
        kind: "t2",
        data: {
          name: "spez",
          icon_img:
            "https://styles.redditmedia.com/icon.png?width=256&amp;s=abc",
          snoovatar_img: "https://i.redd.it/snoo.png",
        },
      }),
    ).toBe("https://styles.redditmedia.com/icon.png?width=256&s=abc");
  });

  it("falls back to snoovatar then the profile subreddit icon", () => {
    expect(
      avatarFromMeJson({
        data: {
          snoovatar_img: "https://i.redd.it/snoo.png",
        },
      }),
    ).toBe("https://i.redd.it/snoo.png");
    expect(
      avatarFromMeJson({
        data: {
          subreddit: {
            icon_img: "https://styles.redditmedia.com/community.png",
          },
        },
      }),
    ).toBe("https://styles.redditmedia.com/community.png");
  });
});

describe("entriesFromListing", () => {
  it("maps t3 children to saved entries", () => {
    const { entries, after } = entriesFromListing({
      data: {
        after: "t3_next",
        children: [
          {
            kind: "t3",
            data: {
              id: "abc123",
              title: "A photo",
              author: "spez",
              permalink: "/r/pics/comments/abc123/a_photo/",
              url: "https://i.redd.it/x.jpg",
              created_utc: 1_700_000_000,
              score: 42,
              num_comments: 7,
              subreddit: "pics",
              subreddit_name_prefixed: "r/pics",
            },
          },
        ],
      },
    });
    expect(after).toBe("t3_next");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.sourceId).toBe("abc123");
    expect(entries[0]?.url).toBe(
      "https://www.reddit.com/r/pics/comments/abc123/a_photo/",
    );
    expect(entries[0]?.mediaUrl).toBe("https://i.redd.it/x.jpg");
    expect(entries[0]?.publishedAt).toBe("2023-11-14T22:13:20.000Z");
    expect(entries[0]?.likes).toBe(42);
    expect(entries[0]?.comments).toBe(7);
    expect(entries[0]?.subreddit).toBe("r/pics");
  });
});

interface ListingFixture {
  id: string;
  title: string;
  permalink: string;
  url?: string;
  is_video?: boolean;
  media?: {
    type?: string;
    oembed?: { type?: string };
    reddit_video?: { fallback_url?: string; dash_url?: string };
  };
  secure_media?: {
    reddit_video?: { fallback_url?: string; dash_url?: string };
  };
  preview?: { images?: Array<{ source?: { url?: string } }> };
  crosspost_parent_list?: Array<{
    id?: string;
    is_video?: boolean;
    url?: string;
    secure_media?: {
      reddit_video?: { fallback_url?: string; dash_url?: string };
    };
  }>;
}

function listingEntry(
  data: ListingFixture,
): ReturnType<typeof entriesFromListing>["entries"][number] | undefined {
  const { entries } = entriesFromListing(
    RedditListingSchema.parse({
      data: { children: [{ kind: "t3", data }] },
    }),
  );
  return entries[0];
}

describe("entriesFromListing videos", () => {
  it("keeps a Reddit-hosted video and its preview still", () => {
    expect(
      listingEntry({
        id: "abc123",
        title: "Hosted",
        permalink: "/r/videos/comments/abc123/hosted/",
        is_video: true,
        url: "https://v.redd.it/abc",
        secure_media: {
          reddit_video: {
            fallback_url: "https://v.redd.it/abc/DASH_720.mp4?source=fallback",
            dash_url: "https://v.redd.it/abc/DASHPlaylist.mpd",
          },
        },
        preview: {
          images: [{ source: { url: "https://preview.redd.it/hosted.jpg" } }],
        },
      }),
    ).toMatchObject({
      mediaType: "video",
      mediaUrl: "https://preview.redd.it/hosted.jpg",
      mediaUrls: [
        {
          url: "https://v.redd.it/abc/DASH_720.mp4?source=fallback",
          type: "video",
          poster: "https://preview.redd.it/hosted.jpg",
        },
      ],
    });
  });

  it("treats a YouTube embed as a video instead of its thumbnail", () => {
    expect(
      listingEntry({
        id: "1wvrgio",
        title: "Music video",
        permalink: "/r/vjing/comments/1wvrgio/music_video/",
        is_video: false,
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        media: { type: "youtube.com", oembed: { type: "video" } },
        preview: {
          images: [
            {
              source: {
                url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
              },
            },
          ],
        },
      }),
    ).toMatchObject({
      mediaType: "video",
      mediaUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      mediaUrls: [
        {
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          type: "video",
          poster: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        },
      ],
    });
  });

  it("follows a youtu.be, Vimeo, or TikTok link the downloader already supports", () => {
    expect(
      listingEntry({
        id: "short1",
        title: "Short link",
        permalink: "/r/videos/comments/short1/short/",
        url: "https://youtu.be/dQw4w9WgXcQ",
        preview: {
          images: [{ source: { url: "https://i.ytimg.com/vi/x/hq.jpg" } }],
        },
      })?.mediaUrls,
    ).toEqual([
      {
        url: "https://youtu.be/dQw4w9WgXcQ",
        type: "video",
        poster: "https://i.ytimg.com/vi/x/hq.jpg",
      },
    ]);
    expect(
      listingEntry({
        id: "vim1",
        title: "Vimeo",
        permalink: "/r/videos/comments/vim1/vimeo/",
        url: "https://vimeo.com/66085662",
      })?.mediaType,
    ).toBe("video");
    expect(
      listingEntry({
        id: "tt1",
        title: "TikTok",
        permalink: "/r/videos/comments/tt1/tiktok/",
        url: "https://www.tiktok.com/@artist/video/1234567890",
      })?.mediaUrls?.[0],
    ).toMatchObject({
      url: "https://www.tiktok.com/@artist/video/1234567890",
      type: "video",
    });
  });

  it("uses the crossposted Reddit video instead of the outer thumbnail", () => {
    expect(
      listingEntry({
        id: "1x1ctiw",
        title: "Crosspost",
        permalink: "/r/vjing/comments/1x1ctiw/crosspost/",
        is_video: false,
        url: "https://www.reddit.com/r/elsewhere/comments/parent1/original/",
        preview: {
          images: [{ source: { url: "https://preview.redd.it/thumb.jpg" } }],
        },
        crosspost_parent_list: [
          {
            id: "parent1",
            is_video: true,
            url: "https://v.redd.it/abc",
            secure_media: {
              reddit_video: {
                fallback_url:
                  "https://v.redd.it/abc/DASH_720.mp4?source=fallback",
                dash_url: "https://v.redd.it/abc/DASHPlaylist.mpd",
              },
            },
          },
        ],
      }),
    ).toMatchObject({
      mediaType: "video",
      mediaUrl: "https://preview.redd.it/thumb.jpg",
      mediaUrls: [
        {
          url: "https://v.redd.it/abc/DASH_720.mp4?source=fallback",
          type: "video",
          poster: "https://preview.redd.it/thumb.jpg",
        },
      ],
    });
  });

  it("keeps a crosspost of a YouTube video as that video", () => {
    expect(
      listingEntry({
        id: "crossyt",
        title: "Crosspost youtube",
        permalink: "/r/videos/comments/crossyt/yt/",
        url: "https://www.reddit.com/r/videos/comments/origyt/watch/",
        preview: {
          images: [{ source: { url: "https://i.ytimg.com/vi/x/hq.jpg" } }],
        },
        crosspost_parent_list: [
          {
            is_video: false,
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          },
        ],
      })?.mediaUrls,
    ).toEqual([
      {
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        type: "video",
        poster: "https://i.ytimg.com/vi/x/hq.jpg",
      },
    ]);
  });

  it("accepts a YouTube embed URL that is not a watch link", () => {
    expect(
      listingEntry({
        id: "emb1",
        title: "Embed",
        permalink: "/r/videos/comments/emb1/embed/",
        url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      })?.mediaUrls?.[0],
    ).toMatchObject({
      url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      type: "video",
    });
  });

  it("leaves link previews, channel pages, and other embed hosts as images", () => {
    expect(
      listingEntry({
        id: "news1",
        title: "A story",
        permalink: "/r/news/comments/news1/story/",
        url: "https://example.com/story",
        preview: {
          images: [{ source: { url: "https://preview.redd.it/story.jpg" } }],
        },
      }),
    ).toMatchObject({
      mediaType: "image",
      mediaUrl: "https://preview.redd.it/story.jpg",
    });
    expect(
      listingEntry({
        id: "chan1",
        title: "A channel",
        permalink: "/r/videos/comments/chan1/channel/",
        url: "https://www.youtube.com/@someone",
        preview: {
          images: [{ source: { url: "https://preview.redd.it/channel.jpg" } }],
        },
      })?.mediaType,
    ).toBe("image");
    expect(
      listingEntry({
        id: "st1",
        title: "Streamable",
        permalink: "/r/videos/comments/st1/stream/",
        url: "https://streamable.com/abc123",
        preview: {
          images: [{ source: { url: "https://preview.redd.it/stream.jpg" } }],
        },
      })?.mediaType,
    ).toBe("image");
  });
});

describe("redditListingUrl", () => {
  it("builds saved and upvoted listing URLs", () => {
    expect(redditListingUrl("spez", "saved", null)).toBe(
      "https://www.reddit.com/user/spez/saved.json?limit=100&raw_json=1&type=links",
    );
    expect(redditListingUrl("spez", "upvoted", "t3_next")).toBe(
      "https://www.reddit.com/user/spez/upvoted.json?limit=100&raw_json=1&type=links&after=t3_next",
    );
  });
});
