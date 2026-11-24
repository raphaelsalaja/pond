import { z } from "zod";
import type { ExportEntry, ExportParser } from "./types";
import { parseJsonText } from "./walk";

const TWEET_ID = /^\d+$/;

const LikeFile = z.array(
  z
    .object({ like: z.object({ tweetId: z.string().optional() }) })
    .catch({ like: {} }),
);

export const xParser: ExportParser = {
  id: "x",
  label: "X",
  matches: (path) => /(^|\/)data\/like(-part\d+)?\.js$/i.test(path),
  parse: (_path, text) => {
    const start = text.indexOf("=");
    if (start < 0) {
      return [];
    }
    const json = parseJsonText(text.slice(start + 1));
    const rows = LikeFile.safeParse(json);
    if (!rows.success) {
      return [];
    }
    return rows.data.flatMap(({ like }): Array<ExportEntry> =>
      like.tweetId && TWEET_ID.test(like.tweetId)
        ? [
            {
              url: `https://x.com/i/web/status/${like.tweetId}`,
              listKind: "liked",
              savedAt: null,
            },
          ]
        : [],
    );
  },
};
