import type { Capture, RawJson } from "@pond/schema/raw";
import { describe, expect, it } from "vitest";
import { CaptureIncompleteError } from "../extractors/errors";
import {
  createCaptureTweetRunner,
  createCaptureTweetTask,
  isCaptureTweetStale,
} from "./capture-tweet";
import type { CaptureTweetPorts, CaptureTweetSave } from "./capture-tweet";

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

type TweetShotArgs = Parameters<TestPorts["screenshotTweetDual"]>[0];
type ThreadsShotArgs = Parameters<TestPorts["screenshotThreadsDual"]>[0];
type PersistOptions = Parameters<TestPorts["persistSave"]>[2];

function makePorts(
  initial: CaptureTweetSave,
  screenshotResult: TweetDualResult,
  { nativeCardMisses = false }: { nativeCardMisses?: boolean } = {},
) {
  let stored = initial;
  const persisted: Array<PersistOptions> = [];
  const tweetShots: Array<TweetShotArgs> = [];
  const threadsShots: Array<ThreadsShotArgs> = [];
  const renders = { tweet: 0, threads: 0, bluesky: 0 };
  const card = nativeCardMisses ? null : rendered;
  const ports = {
    readSave: async () => stored,
    persistSave: async (
      ...[, patch, options]: Parameters<TestPorts["persistSave"]>
    ) => {
      persisted.push(options);
      if (patch.rawJson) {
        stored = { ...stored, rawJson: patch.rawJson };
      }
    },
    screenshotTweetDual: async (
      args: TweetShotArgs,
    ): Promise<TweetDualResult> => {
      tweetShots.push(args);
      return screenshotResult;
    },
    screenshotThreadsDual: async (
      args: ThreadsShotArgs,
    ): Promise<Awaited<ReturnType<TestPorts["screenshotThreadsDual"]>>> => {
      threadsShots.push(args);
      return screenshotResult;
    },
    renderTweetCardPng: async (): Promise<
      Awaited<ReturnType<TestPorts["renderTweetCardPng"]>>
    > => {
      renders.tweet += 1;
      return card;
    },
    renderThreadsCardPng: async (): Promise<
      Awaited<ReturnType<TestPorts["renderThreadsCardPng"]>>
    > => {
      renders.threads += 1;
      return card;
    },
    renderBlueskyCardPng: async (): Promise<
      Awaited<ReturnType<TestPorts["renderBlueskyCardPng"]>>
    > => {
      renders.bluesky += 1;
      return card;
    },
    inlineCaptureAvatars: async (capture: Capture) => ({ capture }),
  } satisfies TestPorts;

  return {
    getStored: () => stored,
    persisted,
    runCaptureTweet: createCaptureTweetRunner(ports),
    tweetShots,
    threadsShots,
    renders,
  };
}

function blueskySave(): CaptureTweetSave {
  return {
    id: "save-1",
    source: "bluesky",
    sourceId: "3n25h2hetys2m",
    url: "https://bsky.app/profile/atproto.com/post/3n25h2hetys2m",
    author: "@atproto.com",
    rawJson: {
      extractorId: "test",
      extractedAt: "2026-11-16T00:00:00.000Z",
      capture: {
        id: "3n25h2hetys2m",
        source: "bluesky",
        url: "https://bsky.app/profile/atproto.com/post/3n25h2hetys2m",
        description: "A Bluesky post",
        media: [],
      },
    },
  };
}

describe("runCaptureTweet for Bluesky", () => {
  it("writes the native card and stamps the version", async () => {
    const harness = makePorts(blueskySave(), {
      light: { ok: true, png: rendered },
      dark: { ok: true, png: rendered },
    });

    await expect(harness.runCaptureTweet("save-1")).resolves.toMatchObject({
      captured: 2,
    });
    expect(harness.renders.bluesky).toBe(2);
    expect(harness.renders.tweet).toBe(0);
    expect(isCaptureTweetStale(harness.getStored().rawJson)).toBe(false);
  });

  it("never opens a live screenshot when the native card misses", async () => {
    const harness = makePorts(
      blueskySave(),
      {
        light: { ok: true, png: rendered },
        dark: { ok: true, png: rendered },
      },
      { nativeCardMisses: true },
    );

    await expect(harness.runCaptureTweet("save-1")).resolves.toMatchObject({
      captured: 0,
    });
    expect(harness.tweetShots).toEqual([]);
    expect(harness.threadsShots).toEqual([]);
  });
});

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
    expect(
      isCaptureTweetStale({ ...reply, capture: post, captureTweetVersion: 13 }),
    ).toBe(false);
  });

  it("renders a post card again when a pre-2.6.0 batch may have shared it", () => {
    const { replyTo: _, ...post } = replyRaw().capture;
    expect(
      isCaptureTweetStale({
        ...replyRaw(),
        capture: post,
        captureTweetVersion: 12,
      }),
    ).toBe(true);
  });

  it("renders only Threads cards again for the threads.com layout", () => {
    const { replyTo: _, ...post } = replyRaw().capture;
    const threads = { ...post, source: "threads" as const };
    expect(
      isCaptureTweetStale({
        ...replyRaw(),
        capture: threads,
        captureTweetVersion: 15,
      }),
    ).toBe(true);
    expect(
      isCaptureTweetStale({
        ...replyRaw(),
        capture: threads,
        captureTweetVersion: 16,
      }),
    ).toBe(false);
    expect(
      isCaptureTweetStale({
        ...replyRaw(),
        capture: post,
        captureTweetVersion: 13,
      }),
    ).toBe(false);
  });
});

describe("runCaptureTweet live screenshot validation", () => {
  it("does not persist either variant when scheme validation fails", async () => {
    const raw = replyRaw();
    raw.capture.isReply = false;
    delete raw.capture.replyTo;
    const harness = makePorts(
      save(raw),
      {
        light: { ok: false, reason: "scheme_mismatch" },
        dark: { ok: false, reason: "scheme_mismatch" },
      },
      { nativeCardMisses: true },
    );

    await expect(harness.runCaptureTweet("save-1")).resolves.toMatchObject({
      captured: 0,
    });
    expect(harness.persisted).toEqual([]);
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
    const actorReasons = harness.persisted.map(
      (options) => options.actorReason,
    );
    expect(actorReasons).not.toContain(
      "pipeline:capture-tweet:tweet_reply_parent_light",
    );
    expect(actorReasons).not.toContain(
      "pipeline:capture-tweet:tweet_reply_parent_dark",
    );
  });

  it("screenshots a reply without the parent post when the native card misses", async () => {
    const harness = makePorts(
      save(replyRaw()),
      {
        light: { ok: true, png: rendered },
        dark: { ok: true, png: rendered },
      },
      { nativeCardMisses: true },
    );

    await harness.runCaptureTweet("save-1");

    const reply = harness.tweetShots.find((args) => args.sourceId === "2");
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
      { nativeCardMisses: true },
    );

    await harness.runCaptureTweet("save-1");

    const reply = harness.threadsShots.find(
      (args) => args.sourceId === "ReplyCode",
    );
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

    const first = runTask("save-1");
    await expect(first).rejects.toBeInstanceOf(CaptureIncompleteError);
    await expect(first).rejects.toThrow(
      "capture_tweet: reply parent still pending",
    );
    await expect(runTask("save-1")).rejects.toThrow(
      "capture_tweet: reply parent still pending",
    );
    expect(harness.tweetShots).toHaveLength(2);
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
    expect(harness.tweetShots).toHaveLength(1);
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

  it("renders a current card again when refresh asks for its own media", async () => {
    const current: RawJson = {
      extractorId: "test",
      extractedAt: "2026-10-16T00:00:00.000Z",
      captureTweetVersion: 13,
      capture: {
        id: "9",
        source: "twitter",
        url: "https://x.com/a/status/9",
        description: "A photo",
        media: [{ type: "image", url: "https://pbs.twimg.com/media/a.jpg" }],
      },
    };
    const harness = makePorts(save(current), {
      light: { ok: true, png: rendered },
      dark: { ok: true, png: rendered },
    });

    await harness.runCaptureTweet("save-1");
    expect(harness.renders.tweet).toBe(0);

    await harness.runCaptureTweet("save-1", { force: true });
    expect(harness.renders.tweet).toBeGreaterThan(0);
  });

  it("stops before a screenshot when capture is already cancelled", async () => {
    const harness = makePorts(save(replyRaw()), {
      light: { ok: true, png: rendered },
      dark: { ok: true, png: rendered },
    });
    const signal = AbortSignal.abort();
    const runTask = createCaptureTweetTask(harness.runCaptureTweet);

    await expect(runTask("save-1", signal)).resolves.toBeUndefined();
    expect(harness.tweetShots).toEqual([]);
  });
});
