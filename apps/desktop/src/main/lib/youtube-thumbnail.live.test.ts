import { describe, expect, it } from "vitest";
import {
  recordedShort,
  recordedShortIds,
} from "./youtube-short-covers.fixture";

/**
 * Checks the recorded Shorts facts against youtube.com. Opt-in, since it needs
 * the network: POND_LIVE_YOUTUBE=1 pnpm --filter @pond/desktop exec vitest run src/main/lib/youtube-thumbnail.live.test.ts
 */
describe.skipIf(process.env.POND_LIVE_YOUTUBE !== "1")(
  "live YouTube Shorts covers",
  () => {
    it.each(recordedShortIds)(
      "%s still serves the recorded bare files",
      async (id) => {
        const files = Object.entries(recordedShort(id).images);
        const served = await Promise.all(
          files.map(async ([file]) => {
            const response = await fetch(
              `https://i.ytimg.com/vi/${id}/${file}`,
              { method: "HEAD" },
            );
            return [file, response.ok];
          }),
        );
        expect(Object.fromEntries(served)).toEqual(
          Object.fromEntries(
            files.map(([file, dims]) => [file, dims !== null]),
          ),
        );
      },
    );

    it.each(recordedShortIds)(
      "%s's Shorts page still names the recorded cover file",
      async (id) => {
        const response = await fetch(`https://www.youtube.com/shorts/${id}`, {
          headers: { "accept-language": "en-US" },
        });
        const html = await response.text();
        const covers =
          recordedShort(id).shortsPlayer.microformat.playerMicroformatRenderer
            .thumbnail.thumbnails;
        const file = new URL(covers[0]?.url ?? "").pathname;
        expect(html).toContain('"isOriginalAspectRatio":true');
        expect(html).toContain(`https://i.ytimg.com${file}?`);
      },
    );
  },
);
