import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { inPageRedditNormalize } from "./normalize";

const PAGE = "https://www.reddit.com/r/vjing/comments/1wvrgio/title/";

function readPost(html: string) {
  const { window } = new JSDOM(
    `<!doctype html><html><body>${html}</body></html>`,
    { url: PAGE },
  );
  const read = runInNewContext(`(${inPageRedditNormalize.toString()})`, {
    document: window.document,
    location: window.location,
    HTMLVideoElement: window.HTMLVideoElement,
    URL,
  });
  return read().extractPostMeta();
}

describe("reddit post page media", () => {
  it("saves a YouTube embed as a video and keeps the thumbnail as the poster", () => {
    const page = readPost(`
      <meta property="og:image" content="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg">
      <shreddit-post id="t3_1wvrgio" post-title="Music video" post-type="link"
        content-href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"></shreddit-post>
    `);
    expect(page).toMatchObject({
      title: "Music video",
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

  it("reads a crossposted Reddit player instead of the outer thumbnail", () => {
    const page = readPost(`
      <meta property="og:image" content="https://preview.redd.it/thumb.jpg">
      <shreddit-post id="t3_1x1ctiw" post-title="Crosspost" post-type="crosspost"
        content-href="https://www.reddit.com/r/elsewhere/comments/parent1/original/">
        <shreddit-player post-id="t3_parent1" src="https://v.redd.it/abc/HLSPlaylist.m3u8"
          poster="https://preview.redd.it/thumb.jpg"></shreddit-player>
      </shreddit-post>
    `);
    expect(page).toMatchObject({
      mediaType: "video",
      mediaUrls: [
        {
          url: "https://v.redd.it/abc/HLSPlaylist.m3u8",
          type: "video",
          poster: "https://preview.redd.it/thumb.jpg",
        },
      ],
    });
  });

  it("keeps a hosted video from og:video", () => {
    const page = readPost(`
      <meta property="og:video" content="https://v.redd.it/own/DASH_720.mp4">
      <meta property="og:image" content="https://preview.redd.it/own.jpg">
      <shreddit-post id="t3_own" post-title="Hosted" post-type="video"></shreddit-post>
    `);
    expect(page?.mediaType).toBe("video");
    expect(page?.mediaUrls?.[0]?.url).toBe(
      "https://v.redd.it/own/DASH_720.mp4",
    );
  });

  it("keeps an image post as an image when a promoted player sits outside it", () => {
    const page = readPost(`
      <shreddit-player post-id="t3_ad" src="https://v.redd.it/ad/HLSPlaylist.m3u8"></shreddit-player>
      <meta property="og:image" content="https://i.redd.it/photo.jpg">
      <shreddit-post id="t3_photo" post-title="A photo" post-type="image"></shreddit-post>
    `);
    expect(page).toMatchObject({
      mediaType: "image",
      mediaUrl: "https://i.redd.it/photo.jpg",
      mediaUrls: [{ url: "https://i.redd.it/photo.jpg", type: "image" }],
    });
  });
});
