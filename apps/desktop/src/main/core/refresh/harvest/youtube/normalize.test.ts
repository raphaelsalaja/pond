import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { recordedShort } from "../../../../lib/youtube-short-covers.fixture";
import type { RecordedPlayer } from "../../../../lib/youtube-short-covers.fixture";
import { buildExpression } from "./item";
import type { YoutubeWatchPage } from "./normalize";

const caption = `#gregdoucette #leenbeefpatty #fitness

Game Changing TEST BOOSTER FERULA:
https://www.htltsupps.com/products/ferula

SCULPTD Training App:
https://www.sculptdapp.com/`;

const descriptionBox = `<div id="title"><h1>Leg day</h1></div>
<div id="description-inner">
  <div id="description-inline-expander">
    <div id="attributed-snippet-text">12345678901234567890123456789 123456<br>78901234567890123456789 K<br>views<br><br>12345678901234567890123456789<br>h ago<br><br>#gregdoucette #leenbeefpatty #fitness<br><br>153,002 views • Sep 29, 2026 • #gregdoucette #leenbeefpatty #fitness<br><br>Game Changing TEST BOOSTER FERULA:<br>https://www.htltsupps.com/products/fe...<br><br>SCULPTD Training App:<br>https://www.sculptdapp.com/ ...more</div>
    <button id="expand">more</button>
  </div>
</div>`;

interface PlayerResponse {
  videoDetails: {
    videoId?: string;
    shortDescription?: string;
    viewCount?: string;
    lengthSeconds?: string;
  };
  microformat?: {
    playerMicroformatRenderer: {
      publishDate?: string;
      thumbnail?: {
        isOriginalAspectRatio?: boolean;
        thumbnails?: Array<{ url?: string; width?: number; height?: number }>;
      };
    };
  };
}

type PageFetch = (
  url: string,
) => Promise<{ ok: boolean; text: () => Promise<string> }>;

async function harvest(
  html: string,
  player?: PlayerResponse | RecordedPlayer,
  options: { videoId?: string; fetch?: PageFetch } = {},
) {
  const videoId = options.videoId ?? "dQw4w9WgXcQ";
  const { window } = new JSDOM(
    `<!doctype html><html><body>${html}</body></html>`,
    { url: `https://www.youtube.com/watch?v=${videoId}` },
  );
  const page: Promise<YoutubeWatchPage | null> = runInNewContext(
    buildExpression(videoId),
    {
      document: window.document,
      location: window.location,
      ytInitialPlayerResponse: player,
      URL,
      AbortSignal,
      fetch: options.fetch,
      setTimeout,
      clearTimeout,
    },
  );
  return page;
}

/** A Shorts page as youtube.com serves it: the player response sits in an inline script beside other page state. */
function shortsPageHtml(player: RecordedPlayer): string {
  return `<!doctype html><html><body><script>var ytInitialData = {"a":"}{"};</script><script nonce="x">var ytInitialPlayerResponse = ${JSON.stringify(player)};var meta = document.createElement('meta');</script></body></html>`;
}

function recordedPageFetch(id: string) {
  const fetched: Array<string> = [];
  const fetch: PageFetch = async (url) => {
    fetched.push(url);
    const isShorts = new URL(url).pathname === `/shorts/${id}`;
    return {
      ok: isShorts,
      text: async () =>
        isShorts ? shortsPageHtml(recordedShort(id).shortsPlayer) : "",
    };
  };
  return { fetch, fetched };
}

describe("youtube watch description", () => {
  it("saves the player caption instead of the description box", async () => {
    const page = await harvest(descriptionBox, {
      videoDetails: { shortDescription: caption },
    });
    expect(page?.description).toBe(caption);
  });

  it("leaves the description empty when the video has no caption", async () => {
    const page = await harvest(descriptionBox, {
      videoDetails: { shortDescription: "  " },
    });
    expect(page?.title).toBe("Leg day");
    expect(page?.description).toBeUndefined();
  });

  it("drops view counts, the digit probe, and the expand control when the player caption is missing", async () => {
    const page = await harvest(descriptionBox);
    expect(page?.description).toBe(`#gregdoucette #leenbeefpatty #fitness

Game Changing TEST BOOSTER FERULA:
https://www.htltsupps.com/products/fe...

SCULPTD Training App:
https://www.sculptdapp.com/`);
  });
});

describe("youtube watch metadata", () => {
  const player: PlayerResponse = {
    videoDetails: {
      videoId: "dQw4w9WgXcQ",
      shortDescription: caption,
      viewCount: "768679906",
      lengthSeconds: "234",
    },
    microformat: {
      playerMicroformatRenderer: { publishDate: "2023-12-07T16:00:10-08:00" },
    },
  };

  it("reads views, the publish date, and length from the player response", async () => {
    const page = await harvest(
      `${descriptionBox}<div id="info-strings"><yt-formatted-string>Premiered Dec 8, 2023</yt-formatted-string></div>`,
      player,
    );
    expect(page?.meta).toMatchObject({
      views: 768_679_906,
      publishedAt: "2023-12-07T16:00:10-08:00",
      durationSec: 234,
    });
  });

  it("uses the player's portrait thumbnail instead of the landscape poster", async () => {
    const page = await harvest(
      `${descriptionBox}<video poster="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"></video>`,
      {
        videoDetails: {
          videoId: "dQw4w9WgXcQ",
          lengthSeconds: "39",
        },
        microformat: {
          playerMicroformatRenderer: {
            thumbnail: {
              isOriginalAspectRatio: true,
              thumbnails: [
                {
                  url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
                  width: 480,
                  height: 360,
                },
                {
                  url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oardefault.jpg?sqp=1",
                  width: 405,
                  height: 720,
                },
              ],
            },
          },
        },
      },
    );
    expect(page?.mediaUrl).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/oardefault.jpg?sqp=1",
    );
  });

  it("ignores a player response left over from another video", async () => {
    const page = await harvest(descriptionBox, {
      ...player,
      videoDetails: { ...player.videoDetails, videoId: "otherVideo1" },
    });
    expect(page?.meta?.views).toBeUndefined();
    expect(page?.meta?.durationSec).toBeUndefined();
    expect(page?.description).not.toBe(caption);
  });
});

describe("youtube Shorts cover", () => {
  const watchHtml = (id: string) =>
    `${descriptionBox}<video poster="https://i.ytimg.com/vi/${id}/hqdefault.jpg"></video>`;

  it.each([
    ["-st95jSkprQ", "/vi/-st95jSkprQ/oardefault.jpg"],
    ["m6CRWM9sUzU", "/vi/m6CRWM9sUzU/sardefault.jpg"],
    ["dbXWZjYJ8t8", "/vi/dbXWZjYJ8t8/hq720.jpg"],
  ])(
    "reads %s's cover from its Shorts page when the watch page lists only the landscape composite",
    async (id, path) => {
      const recorded = recordedShort(id);
      const { fetch, fetched } = recordedPageFetch(id);
      const page = await harvest(watchHtml(id), recorded.watchPlayer, {
        videoId: id,
        fetch,
      });
      expect(fetched).toEqual([`https://www.youtube.com/shorts/${id}`]);
      const cover = new URL(page?.mediaUrl ?? "");
      expect(cover.pathname).toBe(path);
      expect(cover.searchParams.has("sqp")).toBe(true);
      expect(page?.mediaUrls).toEqual([{ url: page?.mediaUrl, type: "video" }]);
    },
  );

  it("keeps the watch page's poster when the Shorts page is not a Short", async () => {
    const recorded = recordedShort("-st95jSkprQ");
    const page = await harvest(watchHtml("-st95jSkprQ"), recorded.watchPlayer, {
      videoId: "-st95jSkprQ",
      fetch: async () => ({
        ok: true,
        text: async () => shortsPageHtml(recorded.watchPlayer),
      }),
    });
    expect(page?.mediaUrl).toBe(
      "https://i.ytimg.com/vi/-st95jSkprQ/hqdefault.jpg",
    );
  });

  it("does not open the Shorts page for a video longer than a Short", async () => {
    const { fetch, fetched } = recordedPageFetch("dQw4w9WgXcQ");
    const page = await harvest(
      watchHtml("dQw4w9WgXcQ"),
      { videoDetails: { videoId: "dQw4w9WgXcQ", lengthSeconds: "234" } },
      { fetch },
    );
    expect(fetched).toEqual([]);
    expect(page?.mediaUrl).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
  });

  it("keeps the watch page's poster when the Shorts page cannot be read", async () => {
    const page = await harvest(
      watchHtml("dQw4w9WgXcQ"),
      { videoDetails: { videoId: "dQw4w9WgXcQ", lengthSeconds: "40" } },
      {
        fetch: async () => {
          throw new Error("offline");
        },
      },
    );
    expect(page?.title).toBe("Leg day");
    expect(page?.mediaUrl).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
  });
});
