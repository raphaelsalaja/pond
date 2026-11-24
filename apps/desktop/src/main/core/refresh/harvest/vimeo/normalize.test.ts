import { describe, expect, it } from "vitest";
import {
  captureFromVideo,
  clipEntry,
  clipRows,
  handleFromViewer,
  hasNextPage,
  parseVideos,
} from "./normalize";

const ROW = `<li id="clip_66085662" data-start-page="/user755559/likes/page:1/sort:date" data-position="1">
  <a href="/66085662" title="Drawing Dynamic Visualizations">
    <img src="https://i.vimeocdn.com/video/437346233-a453-d_295x166?region=us" alt="" class="thumbnail thumbnail_lg_wide">
    <div class="data">
      <div class="iris_video-vital__title"><div class="l-ellipsis">Drawing Dynamic Visualizations</div></div>
      <p class="meta"><time datetime="2022-07-10T06:26:16-04:00" title="Sunday, July 10, 2022">4 years ago</time></p>
    </div>
  </a>
</li>`;

const VIDEO = {
  uri: "/videos/66085662",
  name: "Drawing Dynamic Visualizations",
  description: "A talk.",
  release_time: "2013-05-13T17:18:46+00:00",
  duration: 2116,
  pictures: { base_link: "https://i.vimeocdn.com/video/437346233-a453-d" },
  user: { name: "Bret Victor", link: "https://vimeo.com/worrydream" },
};

interface TokenPayload {
  user_id?: number | null;
}

function jwt(payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `e30.${body}.sig`;
}

describe("vimeo normalize", () => {
  it("reads clip ids and the time you added each one", () => {
    expect(clipRows(`<ol>${ROW}<li id="clip_204150149">x</li></ol>`)).toEqual([
      { id: "66085662", at: "2022-07-10T10:26:16.000Z" },
      { id: "204150149" },
    ]);
  });

  it("sees a next page only when the page links one", () => {
    expect(
      hasNextPage('<link rel="next" href="/user755559/likes/page:2">'),
    ).toBe(true);
    expect(hasNextPage(ROW)).toBe(false);
  });

  it("reads the handle from the viewer link, then the token", () => {
    expect(
      handleFromViewer({
        user: { link: "https://vimeo.com/staff" },
        jwt: jwt({}),
      }),
    ).toBe("staff");
    expect(handleFromViewer({ user: {}, jwt: jwt({ user_id: 755_559 }) })).toBe(
      "user755559",
    );
    expect(handleFromViewer({ user: {}, jwt: jwt({ user_id: null }) })).toBe(
      null,
    );
  });

  it("keys hydrated videos by the id in their uri", () => {
    const videos = parseVideos([VIDEO, { uri: "/users/1" }, { name: "x" }]);
    expect([...videos.keys()]).toEqual(["66085662"]);
  });

  it("builds a list entry from a row and its video", () => {
    const [row] = clipRows(ROW);
    expect(
      row && clipEntry(row, parseVideos([VIDEO]).get(row.id), "liked"),
    ).toEqual({
      sourceId: "66085662",
      url: "https://vimeo.com/66085662",
      mediaType: "video",
      listKinds: ["liked"],
      savedAt: "2022-07-10T10:26:16.000Z",
      title: "Drawing Dynamic Visualizations",
      description: "A talk.",
      author: "Bret Victor",
      mediaUrl: "https://vimeo.com/66085662",
      mediaUrls: [
        {
          url: "https://vimeo.com/66085662",
          type: "video",
          poster: "https://i.vimeocdn.com/video/437346233-a453-d",
        },
      ],
    });
  });

  it("keeps a bare entry when hydration has nothing", () => {
    expect(clipEntry({ id: "1" }, undefined, "saved")).toEqual({
      sourceId: "1",
      url: "https://vimeo.com/1",
      mediaType: "video",
      listKinds: ["saved"],
    });
  });

  it("captures the video page as media so yt-dlp downloads it", () => {
    const video = parseVideos([VIDEO]).get("66085662");
    const capture = video && captureFromVideo("66085662", video);
    expect(capture).toMatchObject({
      id: "66085662",
      source: "vimeo",
      url: "https://vimeo.com/66085662",
      title: "Drawing Dynamic Visualizations",
      publishedAt: "2013-05-13T17:18:46+00:00",
      duration: 2116,
      author: {
        name: "Bret Victor",
        profileUrl: "https://vimeo.com/worrydream",
      },
      media: [
        {
          url: "https://vimeo.com/66085662",
          type: "video",
          posterUrl: "https://i.vimeocdn.com/video/437346233-a453-d",
          durationSec: 2116,
        },
      ],
    });
  });
});
