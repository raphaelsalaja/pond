import type { Capture, RawJson } from "@pond/schema/raw";
import { describe, expect, it, vi } from "vitest";
import {
  type CaptureTweetPorts,
  type CaptureTweetSave,
  createCaptureTweetRunner,
  createCaptureTweetTask,
  isCaptureTweetStale,
} from "./capture-tweet";

type TestPorts = CaptureTweetPorts<CaptureTweetSave>;
type TweetDualResult = Awaited<ReturnType<TestPorts["screenshotTweetDual"]>>;

function replyRaw(): RawJson {
  return {
    extractorId: "test",
    extractedAt: "2026-10-16T00:00:00.000Z",
    capture: {
      id: "2",
      source: "twitter",
      url: "https://x.com/alice/status/2",
      description: "Reply post",
      media: [],
      isReply: true,
      replyTo: {
        id: "1",
        source: "twitter",
        url: "https://x.com/bob/status/1",
        author: { handle: "bob" },
        media: [],
      },
    },
  };
}

function save(rawJson: RawJson): CaptureTweetSave {
  return {
    id: "save-1",
    source: "twitter",
    sourceId: "2",
    url: "https://x.com/alice/status/2",
    author: "alice",
    rawJson,
  };
}

const rendered = {
  bytes: Buffer.from("png"),
  width: 10,
  height: 10,
};

function makePorts(
  initial: CaptureTweetSave,
  screenshotResult: TweetDualResult,
) {
  let stored = initial;
  const persistSave = vi.fn(
    async (...[, patch]: Parameters<TestPorts["persistSave"]>) => {
      if (patch.rawJson) stored = { ...stored, rawJson: patch.rawJson };
    },
  );
  const screenshotTweetDual = vi.fn(
    async (
      ..._args: Parameters<TestPorts["screenshotTweetDual"]>
    ): Promise<TweetDualResult> => screenshotResult,
  );
  const screenshotThreadsDual = vi.fn(
    async (
      ..._args: Parameters<TestPorts["screenshotThreadsDual"]>
    ): Promise<Awaited<ReturnType<TestPorts["screenshotThreadsDual"]>>> =>
      screenshotResult,
  );
  const renderTweetCardPng = vi.fn(
    async (
      ..._args: Parameters<TestPorts["renderTweetCardPng"]>
    ): Promise<Awaited<ReturnType<TestPorts["renderTweetCardPng"]>>> =>
      rendered,
  );
  const renderThreadsCardPng = vi.fn(
    async (
      ..._args: Parameters<TestPorts["renderThreadsCardPng"]>
    ): Promise<Awaited<ReturnType<TestPorts["renderThreadsCardPng"]>>> =>
      rendered,
  );
  const inlineCaptureAvatars = vi.fn(async (capture: Capture) => ({ capture }));
  const ports = {
    readSave: async () => stored,
    persistSave,
    screenshotTweetDual,
    screenshotThreadsDual,
    renderTweetCardPng,
    renderThreadsCardPng,
    inlineCaptureAvatars,
  } satisfies TestPorts;

  return {
    getStored: () => stored,
    persistSave,
    runCaptureTweet: createCaptureTweetRunner(ports),
    screenshotTweetDual,
    screenshotThreadsDual,
    renderTweetCardPng,
    renderThreadsCardPng,
  };
}

describe("isCaptureTweetStale", () => {
  it("recaptures a reply whose image still leads with the parent post", () => {
    const reply = { ...replyRaw(), captureTweetVersion: 12 };
    const { replyTo: _, ...post } = reply.capture;
    expect(isCaptureTweetStale(reply)).toBe(true);
    expect(isCaptureTweetStale({ ...reply, captureTweetVersion: 13 })).toBe(
      true,
    );
    expect(isCaptureTweetStale({ ...reply, captureTweetVersion: 14 })).toBe(
      false,
    );
    expect(isCaptureTweetStale({ ...reply, capture: post })).toBe(false);
  });
});

describe("runCaptureTweet reply parent enrichment", () => {
  it("merges parent metadata without persisting parent screenshots", async () => {
    const harness = makePorts(save(replyRaw()), {
      light: { ok: true, png: rendered },
      dark: { ok: true, png: rendered },
      page: {
        id: "1",
        source: "twitter",
        url: "https://x.com/bob/status/1",
        description: "Parent post",
        media: [],
      },
    });

    await expect(harness.runCaptureTweet("save-1")).resolves.toMatchObject({
      captured: 2,
      replyParentPending: false,
    });
    expect(harness.getStored().rawJson?.capture?.replyTo?.description).toBe(
      "Parent post",
    );
    const actorReasons = harness.persistSave.mock.calls.map(
      ([, , options]) => options.actorReason,
    );
    expect(actorReasons).not.toContain(
      "pipeline:capture-tweet:tweet_reply_parent_light",
    );
    expect(actorReasons).not.toContain(
      "pipeline:capture-tweet:tweet_reply_parent_dark",
    );
  });

  it("screenshots a reply without the parent post when the native card misses", async () => {
    const harness = makePorts(save(replyRaw()), {
      light: { ok: true, png: rendered },
      dark: { ok: true, png: rendered },
    });
    harness.renderTweetCardPng.mockResolvedValue(null);

    await harness.runCaptureTweet("save-1");

    const calls = harness.screenshotTweetDual.mock.calls.map(([args]) => args);
    const reply = calls.find((args) => args.sourceId === "2");
    expect(reply).toBeDefined();
    expect(reply).not.toHaveProperty("parentId");
  });

  it("screenshots a Threads reply without its parent post", async () => {
    const raw = replyRaw();
    raw.capture.source = "threads";
    raw.capture.url = "https://www.threads.com/@alice/post/ReplyCode";
    if (raw.capture.replyTo) {
      raw.capture.replyTo.source = "threads";
      raw.capture.replyTo.url = "https://www.threads.com/@bob/post/ParentCode";
    }
    const harness = makePorts(
      {
        ...save(raw),
        source: "threads",
        sourceId: "ReplyCode",
        url: "https://www.threads.com/@alice/post/ReplyCode",
      },
      {
        light: { ok: true, png: rendered },
        dark: { ok: true, png: rendered },
      },
    );
    harness.renderThreadsCardPng.mockResolvedValue(null);

    await harness.runCaptureTweet("save-1");

    const reply = harness.screenshotThreadsDual.mock.calls
      .map(([args]) => args)
      .find((args) => args.sourceId === "ReplyCode");
    expect(reply).toBeDefined();
    expect(reply).not.toHaveProperty("parentId");
  });

  it("reports a transiently missing parent and retries on the next run", async () => {
    const harness = makePorts(save(replyRaw()), {
      light: { ok: true, png: rendered },
      dark: { ok: true, png: rendered },
      pageFailureReason: "timeout",
    });

    const runTask = createCaptureTweetTask(harness.runCaptureTweet);

    await expect(runTask("save-1")).rejects.toThrow(
      "capture_tweet: reply parent still pending",
    );
    await expect(runTask("save-1")).rejects.toThrow(
      "capture_tweet: reply parent still pending",
    );
    expect(harness.screenshotTweetDual).toHaveBeenCalledTimes(2);
    expect(harness.getStored().rawJson?.captureTweetVersion).toBe(14);
    expect(isCaptureTweetStale(harness.getStored().rawJson)).toBe(false);
  });

  it("settles a permanently unavailable parent without retrying", async () => {
    const harness = makePorts(save(replyRaw()), {
      light: { ok: false, reason: "no_article" },
      dark: { ok: false, reason: "no_article" },
    });
    const runTask = createCaptureTweetTask(harness.runCaptureTweet);

    await expect(runTask("save-1")).resolves.toBeUndefined();
    expect(harness.screenshotTweetDual).toHaveBeenCalledOnce();
    expect(
      harness.getStored().rawJson?.capture?.extras?.replyParentUnavailable,
    ).toBe(true);
    expect(isCaptureTweetStale(harness.getStored().rawJson)).toBe(false);
  });

  it("retries when one screenshot proves the parent still exists", async () => {
    const harness = makePorts(save(replyRaw()), {
      light: { ok: false, reason: "no_article" },
      dark: { ok: true, png: rendered },
      pageFailureReason: "no_article",
    });
    const runTask = createCaptureTweetTask(harness.runCaptureTweet);

    await expect(runTask("save-1")).rejects.toThrow(
      "capture_tweet: reply parent still pending",
    );
    expect(
      harness.getStored().rawJson?.capture?.extras?.replyParentUnavailable,
    ).toBeUndefined();
  });

  it("stops before a screenshot when capture is already cancelled", async () => {
    const harness = makePorts(save(replyRaw()), {
      light: { ok: true, png: rendered },
      dark: { ok: true, png: rendered },
    });
    const signal = AbortSignal.abort();
    const runTask = createCaptureTweetTask(harness.runCaptureTweet);

    await expect(runTask("save-1", signal)).resolves.toBeUndefined();
    expect(harness.screenshotTweetDual).not.toHaveBeenCalled();
  });
});
