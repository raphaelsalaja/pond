import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { buildExpression } from "./item";

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

async function harvest(html: string, player?: PlayerResponse) {
  const { window } = new JSDOM(
    `<!doctype html><html><body>${html}</body></html>`,
    { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  );
  return runInNewContext(buildExpression("dQw4w9WgXcQ"), {
    document: window.document,
    location: window.location,
    ytInitialPlayerResponse: player,
    URL,
    setTimeout,
    clearTimeout,
  });
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
