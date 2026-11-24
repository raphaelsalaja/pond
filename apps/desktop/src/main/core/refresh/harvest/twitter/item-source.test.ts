import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { harvestSource } from "./item-source";

const ResultSchema = z.object({
  meta: z
    .object({
      isReply: z.boolean().optional(),
      replyingTo: z.string().optional(),
      replyTo: z
        .object({
          tweetId: z.string(),
          url: z.string(),
          author: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

const normalize = {
  metricFromTestid: () => undefined,
  parseMetric: () => undefined,
  readDuration: () => undefined,
  httpMediaUrl: () => undefined,
  pickLargestSrcset: () => undefined,
};

type Build = (tweetId: string, helpers: typeof normalize) => object;

function isBuild(value: unknown): value is Build {
  return Object.prototype.toString.call(value) === "[object Function]";
}

function runHarvest(html: string) {
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: "https://x.com/alice/status/2",
  });
  const build = dom.window.eval(`(${harvestSource()})`);
  if (!isBuild(build)) {
    throw new Error("harvestSource did not evaluate to a function");
  }
  return ResultSchema.parse(build("2", normalize));
}

describe("Twitter reply parent discovery", () => {
  it("uses the preceding conversation article as the direct parent", () => {
    const result = runHarvest(`
      <article>
        <div data-testid="User-Name"><a href="/bob">Bob @bob</a></div>
        <a href="/bob/status/1"><time datetime="2026-10-15T23:00:00.000Z"></time></a>
        <div data-testid="tweetText">Parent post</div>
      </article>
      <article>
        <div data-testid="User-Name"><a href="/alice">Alice @alice</a></div>
        <a href="/alice/status/2"><time datetime="2026-10-16T00:00:00.000Z"></time></a>
        <a href="/bob">Replying to @bob</a>
        <div data-testid="tweetText">Reply post</div>
      </article>
    `);

    expect(result.meta).toMatchObject({
      isReply: true,
      replyingTo: "bob",
      replyTo: {
        tweetId: "1",
        url: "https://x.com/bob/status/1",
      },
    });
  });

  it("does not treat an unrelated status link in the reply as its parent", () => {
    const result = runHarvest(`
      <article>
        <div data-testid="User-Name"><a href="/alice">Alice @alice</a></div>
        <a href="/alice/status/2"><time datetime="2026-10-16T00:00:00.000Z"></time></a>
        <a href="/bob">Replying to @bob</a>
        <div data-testid="tweetText">
          Reply with <a href="/someone/status/99">an unrelated post</a>
        </div>
      </article>
    `);

    expect(result.meta).toMatchObject({ isReply: true, replyingTo: "bob" });
    expect(result.meta?.replyTo).toBeUndefined();
  });

  it("ignores a quoted article nested inside the real parent", () => {
    const result = runHarvest(`
      <article>
        <div data-testid="User-Name"><a href="/bob">Bob @bob</a></div>
        <a href="/bob/status/1"><time datetime="2026-10-15T23:00:00.000Z"></time></a>
        <div data-testid="tweetText">Parent post</div>
        <article>
          <a href="/carol/status/99"><time datetime="2026-10-15T22:00:00.000Z"></time></a>
          <div data-testid="tweetText">Quoted post</div>
        </article>
      </article>
      <article>
        <div data-testid="User-Name"><a href="/alice">Alice @alice</a></div>
        <a href="/alice/status/2"><time datetime="2026-10-16T00:00:00.000Z"></time></a>
        <a href="/bob">Replying to @bob</a>
        <div data-testid="tweetText">Reply post</div>
      </article>
    `);

    expect(result.meta?.replyTo).toEqual({
      tweetId: "1",
      url: "https://x.com/bob/status/1",
      author: "@bob",
    });
  });

  it("does not replace an unavailable direct parent with an older ancestor", () => {
    const result = runHarvest(`
      <article>
        <a href="/bob/status/1"><time datetime="2026-10-15T22:00:00.000Z"></time></a>
        <div data-testid="tweetText">Older ancestor</div>
      </article>
      <article>
        <div>This post is unavailable.</div>
      </article>
      <article>
        <div data-testid="User-Name"><a href="/alice">Alice @alice</a></div>
        <a href="/alice/status/2"><time datetime="2026-10-16T00:00:00.000Z"></time></a>
        <a href="/carol">Replying to @carol</a>
        <div data-testid="tweetText">Reply post</div>
      </article>
    `);

    expect(result.meta).toMatchObject({ isReply: true, replyingTo: "carol" });
    expect(result.meta?.replyTo).toBeUndefined();
  });
});
