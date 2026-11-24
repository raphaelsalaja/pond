import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildInstagramLikesExpression } from "./likes";

const NEXT_APP = "com.instagram.privacy.activity_center.liked_next";

const LikesResultSchema = z.looseObject({
  entries: z.array(z.looseObject({})).optional(),
});

function item(
  code: string,
  product: string,
  type: number,
  names = ["dkc", "ety"],
) {
  return `(${names[0]}, \\"3996863573288319632_68462680926\\", \\"${code}\\", \\"${product}\\", (${names[1]}, ${type}), \\"https:\\/\\/cdn.example\\/x.jpg\\")`;
}

function nextMarker(cursor: string) {
  return `(dmi, \\"${NEXT_APP}\\", (f4i, (dkc, \\"page_size\\", \\"cursor\\", \\"container_id\\", \\"element_id\\"), (dkc, \\"9\\", \\"${cursor}\\", \\"17841400000000000\\", \\"12345678\\")))`;
}

function payload(...parts: Array<string>) {
  return `for (;;);{"payload":{"layout":{"bloks_payload":"${parts.join(", ")}"}}}`;
}

function run(firstPage: string, laterPages: Array<string | Error>) {
  const pages = [...laterPages];
  const context = {
    location: { pathname: "/your_activity/interactions/likes/" },
    document: { querySelectorAll: () => [] },
    getComputedStyle: () => ({ overflowY: "visible" }),
    setTimeout: (fn: () => void) => setTimeout(fn, 0),
    URLSearchParams,
    __pondIgBloksCaptures: [firstPage],
    __pondIgLikesRequest: {
      url: `/async/wbloks/fetch/?appid=${NEXT_APP}&type=action`,
      body: "params=%7B%7D&lsd=token",
      headers: {},
    },
    fetch: async () => {
      const page = pages.shift() ?? payload();
      if (page instanceof Error) {
        throw page;
      }
      return { ok: true, status: 200, text: async () => page };
    },
  };
  const evaluated: unknown = runInNewContext(
    buildInstagramLikesExpression({ knownIds: [], earlyStop: false }),
    context,
  );
  const result = Promise.resolve(evaluated).then((value) =>
    LikesResultSchema.parse(value),
  );
  return Object.assign(result, { context });
}

describe("Instagram likes", () => {
  it("reads liked posts from minified Bloks payloads", async () => {
    const result = await run(
      payload(
        item("Dd3tj5djHqQ", "clips", 2),
        item("DeEvTWUNxvZ", "feed", 1),
        nextMarker("QVFCdTk4Nkt2ZXZES1Q3ckJ2SkNm=="),
      ),
      [payload(item("DeKLFh4xGXE", "feed", 1))],
    );
    expect(result).toMatchObject({ ok: true, reachedEnd: true });
    expect(result.entries).toEqual([
      expect.objectContaining({
        sourceId: "Dd3tj5djHqQ",
        url: "https://www.instagram.com/reel/Dd3tj5djHqQ/",
      }),
      expect.objectContaining({
        sourceId: "DeEvTWUNxvZ",
        url: "https://www.instagram.com/p/DeEvTWUNxvZ/",
      }),
      expect.objectContaining({ sourceId: "DeKLFh4xGXE" }),
    ]);
  });

  it("still reads unminified action names", async () => {
    const result = await run(
      payload(
        item("DeEvTWUNxvZ", "feed", 1, [
          "bk.action.array.Make",
          "bk.action.i32.Const",
        ]),
        nextMarker("QVFCdTk4Nkt2ZXZES1Q3ckJ2SkNm=="),
      ),
      [],
    );
    expect(result.entries).toEqual([
      expect.objectContaining({ sourceId: "DeEvTWUNxvZ" }),
    ]);
  });

  it("reports a format change instead of an empty list", async () => {
    const result = await run(
      payload(nextMarker("QVFCdTk4Nkt2ZXZES1Q3ckJ2SkNm==")),
      [payload()],
    );
    expect(result).toEqual({ ok: false, reason: "no_match" });
  });

  it("reports a page exception with its message and keeps what it read", async () => {
    const pending = run(
      payload(
        item("Dd3tj5djHqQ", "clips", 2),
        nextMarker("QVFCdTk4Nkt2ZXZES1Q3ckJ2SkNm=="),
      ),
      [
        payload(
          item("DeEvTWUNxvZ", "feed", 1),
          nextMarker("QVFCZW5kT2ZQYWdlVHdvQ3Vyc29y=="),
        ),
        new TypeError("Failed to fetch"),
      ],
    );
    await expect(pending).resolves.toEqual({
      ok: false,
      reason: "page_error",
      error: "TypeError: Failed to fetch",
    });
    expect(pending.context).toHaveProperty("__pondHarvestPartial", [
      {
        sourceId: "Dd3tj5djHqQ",
        url: "https://www.instagram.com/reel/Dd3tj5djHqQ/",
      },
      {
        sourceId: "DeEvTWUNxvZ",
        url: "https://www.instagram.com/p/DeEvTWUNxvZ/",
      },
    ]);
  });
});
