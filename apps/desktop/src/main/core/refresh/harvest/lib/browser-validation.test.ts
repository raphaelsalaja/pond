import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { buildCosmosListExpression } from "../cosmos/list";
import { buildInstagramListExpression } from "../instagram/list";
import { inPageInstagramNormalize } from "../instagram/normalize";
import { inPagePinterestNormalize } from "../pinterest/normalize";
import { buildRedditListExpression } from "../reddit/list";
import { inPageTiktokNormalize } from "../tiktok/normalize";
import { browserValidationSource } from "./browser-validation-source";
import { buildItemExpression } from "./expression";

const args = { knownIds: [], maxItems: 10 };

describe("standalone harvest validation", () => {
  it("normalizes Instagram data inside the serialized expression", async () => {
    const expression = buildItemExpression(
      inPageInstagramNormalize,
      (raw, norm) => norm.normalizeMediaNode(JSON.parse(raw)),
      JSON.stringify({
        code: "example",
        media_type: 2,
        caption: { text: "A caption" },
        like_count: 12,
        play_count: "wrong",
        user: { username: "artist", is_verified: "wrong" },
        video_versions: [{ url: "https://example.com/video.mp4" }],
      }),
    );
    const result = await runInNewContext(expression, {});
    expect(result).toMatchObject({
      sourceId: "example",
      description: "A caption",
      author: "@artist",
      meta: { metrics: { likes: 12 } },
    });
    expect(result.meta.metrics.plays).toBeUndefined();
    expect(result.meta.verified).toBeUndefined();
  });

  it("loads the TikTok normalizer without module or application globals", async () => {
    const expression = buildItemExpression(
      inPageTiktokNormalize,
      (url, norm) => norm.extractVideoId(url),
      "https://www.tiktok.com/@artist/video/1234567890",
    );
    expect(
      await runInNewContext(expression, {
        URL,
        location: { origin: "https://www.tiktok.com" },
      }),
    ).toBe("1234567890");
  });

  it("preserves the Pinterest image URL that loaded in the browser", async () => {
    const imageUrl =
      "https://i.pinimg.com/736x/96/1a/da/961adaf7db83e6d449a67674731c29d5.jpg";
    const expression = buildItemExpression(
      inPagePinterestNormalize,
      (_arg, norm) => norm.extractPinPageMeta(),
      "",
    );
    const result = await runInNewContext(expression, {
      URL,
      location: { origin: "https://www.pinterest.com" },
      document: {
        documentElement: { lang: "" },
        querySelector: (selector: string) =>
          selector.includes('data-test-id="pin-closeup-image"')
            ? { src: imageUrl, currentSrc: imageUrl }
            : null,
      },
    });

    expect(result).toMatchObject({
      mediaUrl: imageUrl,
      mediaUrls: [{ url: imageUrl, type: "image" }],
    });
  });

  it("falls back to any pinimg still when closeup selectors are missing", async () => {
    const imageUrl = "https://i.pinimg.com/736x/story.jpg";
    const expression = buildItemExpression(
      inPagePinterestNormalize,
      (_arg, norm) => norm.extractPinPageMeta(),
      "",
    );
    const result = await runInNewContext(expression, {
      URL,
      location: { origin: "https://www.pinterest.com" },
      document: {
        documentElement: { lang: "" },
        querySelector: (selector: string) =>
          selector.includes("pinimg.com")
            ? { src: imageUrl, currentSrc: imageUrl }
            : null,
      },
    });
    expect(result).toMatchObject({
      mediaUrl: imageUrl,
      mediaUrls: [{ url: imageUrl, type: "image" }],
    });
  });

  it("preserves valid TikTok fields and drops malformed optional metrics", () => {
    const result = runInNewContext(
      `${browserValidationSource}\nPondHarvestValidation.browserValidators.tiktokItem.parse({ id: '1', createTime: 123, author: { verified: false }, stats: { playCount: 7, diggCount: 'many', shareCount: '1e3' }, video: { duration: 'bad' } });`,
      {},
    );
    expect(result).toMatchObject({
      id: "1",
      createTime: 123,
      author: { verified: false },
      stats: { playCount: 7 },
    });
    expect(result.stats.diggCount).toBeUndefined();
    expect(result.stats.shareCount).toBeUndefined();
    expect(result.video.duration).toBeUndefined();
  });

  it("reads TikTok integers sent as digit strings", () => {
    const result = runInNewContext(
      `${browserValidationSource}\nPondHarvestValidation.browserValidators.tiktokItem.parse({ createTime: '1564234358', stats: { diggCount: 35200, collectCount: '648' } });`,
      {},
    );
    expect(result.createTime).toBe(1_564_234_358);
    expect(result.stats).toEqual({ diggCount: 35_200, collectCount: 648 });
  });

  it("rejects invalid scalars and arrays at object boundaries", () => {
    const result = runInNewContext(
      `${browserValidationSource}\nconst validators = PondHarvestValidation.browserValidators; [validators.text.safeParse(7).success, validators.number.safeParse('7').success, validators.number.safeParse(Infinity).success, validators.object.safeParse([]).success, validators.object.safeParse(null).success, validators.object.safeParse({ id: 1 }).success];`,
      {},
    );
    expect(result).toEqual([false, false, false, false, false, true]);
  });

  it.each([
    ["Cosmos", buildCosmosListExpression(args)],
    ["Reddit", buildRedditListExpression(args)],
    ["Instagram", buildInstagramListExpression(args)],
  ])(
    "executes %s list expressions without Node imports",
    async (_name, expression) => {
      const result = await runInNewContext(expression, {
        location: { pathname: "/login", href: "https://example.com/login" },
        document: { querySelector: () => null },
      });
      expect(result).toMatchObject({ ok: false, reason: "auth_required" });
    },
  );
});
