import type { Capture, RawJson } from "@pond/schema/raw";
import { StoredRawJsonSchema } from "@pond/schema/raw-schema";
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
  renderer: "xeet" as const,
};

type TweetShotArgs = Parameters<TestPorts["screenshotTweetDual"]>[0];
type ThreadsShotArgs = Parameters<TestPorts["screenshotThreadsDual"]>[0];
type PersistOptions = Parameters<TestPorts["persistSave"]>[2];
type StructuredRenderer = NonNullable<
  Awaited<ReturnType<TestPorts["renderTweetCardPng"]>>
>["renderer"];

function makePorts(
  initial: CaptureTweetSave,
  screenshotResult: TweetDualResult,
  {
    structuredCardMisses = false,
    renderers = {},
    tweetScreenshotForArgs,
  }: {
    structuredCardMisses?: boolean;
    renderers?: Partial<Record<"light" | "dark", StructuredRenderer>>;
    tweetScreenshotForArgs?: (args: TweetShotArgs) => TweetDualResult;
  } = {},
) {
  let stored = initial;
  const persisted: Array<PersistOptions> = [];
  const tweetShots: Array<TweetShotArgs> = [];
  const threadsShots: Array<ThreadsShotArgs> = [];
  const renders = { tweet: 0, threads: 0, bluesky: 0 };
  const cardFor = (scheme: "light" | "dark") => {
    if (structuredCardMisses) return null;
    return {
      ...rendered,
      renderer:
        scheme === "light"
          ? (renderers.light ?? "xeet")
          : (renderers.dark ?? "xeet"),
    };
  };
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
      return tweetScreenshotForArgs?.(args) ?? screenshotResult;
    },
    screenshotThreadsDual: async (
      args: ThreadsShotArgs,
    ): Promise<Awaited<ReturnType<TestPorts["screenshotThreadsDual"]>>> => {
      threadsShots.push(args);
      return screenshotResult;
    },
    renderTweetCardPng: async (
      _capture,
      _author,
      scheme,
    ): Promise<Awaited<ReturnType<TestPorts["renderTweetCardPng"]>>> => {
      renders.tweet += 1;
      return cardFor(scheme);
    },
    renderThreadsCardPng: async (
      _capture,
      _author,
      scheme,
    ): Promise<Awaited<ReturnType<TestPorts["renderThreadsCardPng"]>>> => {
      renders.threads += 1;
      return cardFor(scheme);
    },
    renderBlueskyCardPng: async (
      _capture,
      _author,
      scheme,
    ): Promise<Awaited<ReturnType<TestPorts["renderBlueskyCardPng"]>>> => {
      renders.bluesky += 1;
      return cardFor(scheme);
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

function postRaw(): RawJson {
  return {
    extractorId: "test",
    extractedAt: "2026-10-16T00:00:00.000Z",
    capture: {
      id: "9",
      source: "twitter",
      url: "https://x.com/alice/status/9",
      description: "A post",
      media: [],
    },
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
  it("writes the structured card, its renderer provenance, and the version", async () => {
    const harness = makePorts(blueskySave(), {
      light: { ok: true, png: rendered },
      dark: { ok: true, png: rendered },
    });

    await expect(harness.runCaptureTweet("save-1")).resolves.toMatchObject({
      captured: 2,
    });
    expect(harness.renders.bluesky).toBe(2);
    expect(harness.renders.tweet).toBe(0);
    expect(harness.getStored().rawJson?.postCardProvenance).toEqual({
      light: { renderer: "xeet", captureTweetVersion: 13 },
      dark: { renderer: "xeet", captureTweetVersion: 13 },
    });
    expect(isCaptureTweetStale(harness.getStored().rawJson)).toBe(false);
    expect(
      harness.persisted.some((options) => options.writeInfo === true),
    ).toBe(true);
  });

  it("never opens a live screenshot when the structured card misses", async () => {
    const harness = makePorts(
      blueskySave(),
      {
        light: { ok: true, png: rendered },
        dark: { ok: true, png: rendered },
      },
      { structuredCardMisses: true },
    );

    await expect(harness.runCaptureTweet("save-1")).resolves.toMatchObject({
      captured: 0,
    });
    expect(harness.tweetShots).toEqual([]);
    expect(harness.threadsShots).toEqual([]);
  });
});

describe("post card renderer provenance", () => {
  it("records the React renderer without conflating it with xeet", async () => {
    const harness = makePorts(
      save(postRaw()),
      {
        light: { ok: true, png: rendered },
        dark: { ok: true, png: rendered },
      },
      { renderers: { light: "react", dark: "react" } },
    );

    await harness.runCaptureTweet("save-1");

    expect(harness.getStored().rawJson?.postCardProvenance).toEqual({
      light: { renderer: "react", captureTweetVersion: 13 },
      dark: { renderer: "react", captureTweetVersion: 13 },
    });
  });

  it("records mixed structured outcomes per scheme", async () => {
    const harness = makePorts(
      save(postRaw()),
      {
        light: { ok: true, png: rendered },
        dark: { ok: true, png: rendered },
      },
      { renderers: { light: "xeet", dark: "react" } },
    );

    await harness.runCaptureTweet("save-1");

    expect(harness.getStored().rawJson?.postCardProvenance).toEqual({
      light: { renderer: "xeet", captureTweetVersion: 13 },
      dark: { renderer: "react", captureTweetVersion: 13 },
    });
  });

  it("records live screenshots per scheme when structured rendering misses", async () => {
    const harness = makePorts(
      save(postRaw()),
      {
        light: { ok: true, png: rendered },
        dark: { ok: true, png: rendered },
      },
      { structuredCardMisses: true },
    );

    await harness.runCaptureTweet("save-1");

    expect(harness.getStored().rawJson?.postCardProvenance).toEqual({
      light: { renderer: "screenshot", captureTweetVersion: 13 },
      dark: { renderer: "screenshot", captureTweetVersion: 13 },
    });
    expect(harness.getStored().rawJson?.captureTweetVersion).toBe(13);
    expect(
      harness.persisted.some((options) => options.writeInfo === true),
    ).toBe(true);
  });

  it("keeps partial screenshot provenance and completes the version across runs", async () => {
    const shots: TweetDualResult = {
      light: { ok: true, png: rendered },
      dark: { ok: false, reason: "capture_failed" },
    };
    const harness = makePorts(save(postRaw()), shots, {
      structuredCardMisses: true,
    });

    await harness.runCaptureTweet("save-1");

    expect(harness.getStored().rawJson?.postCardProvenance).toEqual({
      light: { renderer: "screenshot", captureTweetVersion: 13 },
    });
    expect(harness.getStored().rawJson?.captureTweetVersion).toBeUndefined();
    expect(isCaptureTweetStale(harness.getStored().rawJson)).toBe(true);

    shots.light = { ok: false, reason: "capture_failed" };
    shots.dark = { ok: true, png: rendered };
    await harness.runCaptureTweet("save-1");

    expect(harness.getStored().rawJson?.postCardProvenance).toEqual({
      light: { renderer: "screenshot", captureTweetVersion: 13 },
      dark: { renderer: "screenshot", captureTweetVersion: 13 },
    });
    expect(harness.getStored().rawJson?.captureTweetVersion).toBe(13);
    expect(isCaptureTweetStale(harness.getStored().rawJson)).toBe(false);
  });

  it("does not attribute quote screenshots to the primary post card", async () => {
    const harness = makePorts(
      save(postRaw()),
      {
        light: { ok: false, reason: "capture_failed" },
        dark: { ok: false, reason: "capture_failed" },
      },
      {
        structuredCardMisses: true,
        tweetScreenshotForArgs: (args) => {
          if (args.sourceId === "2") {
            return {
              light: { ok: true, png: rendered },
              dark: { ok: false, reason: "capture_failed" },
              quotedUrl: "https://x.com/bob/status/7",
            };
          }
          return {
            light: { ok: true, png: rendered },
            dark: { ok: true, png: rendered },
          };
        },
      },
    );

    await harness.runCaptureTweet("save-1");

    expect(harness.tweetShots.some((args) => args.sourceId === "7")).toBe(true);
    expect(harness.getStored().rawJson?.postCardProvenance).toEqual({
      light: { renderer: "screenshot", captureTweetVersion: 13 },
    });
  });

  it("writes provenance even when a forced refresh does not need a version stamp", async () => {
    const raw = { ...postRaw(), captureTweetVersion: 13 };
    const harness = makePorts(save(raw), {
      light: { ok: true, png: rendered },
      dark: { ok: true, png: rendered },
    });

    await harness.runCaptureTweet("save-1", { force: true });

    expect(harness.getStored().rawJson?.postCardProvenance?.light).toEqual({
      renderer: "xeet",
      captureTweetVersion: 13,
    });
    expect(
      harness.persisted.some((options) => options.writeInfo === true),
    ).toBe(true);
  });

  it("replaces screenshot provenance and clears the repair marker after a structured render", async () => {
    const raw: RawJson = {
      ...postRaw(),
      captureTweetVersion: 13,
      postCardProvenance: {
        light: { renderer: "screenshot", captureTweetVersion: 13 },
        dark: { renderer: "screenshot", captureTweetVersion: 13 },
      },
      postCardRepair: { version: 1, attemptedAt: "2026-11-16T00:00:00.000Z" },
    };
    const harness = makePorts(save(raw), {
      light: { ok: true, png: rendered },
      dark: { ok: true, png: rendered },
    });

    await harness.runCaptureTweet("save-1", { force: true });

    expect(harness.getStored().rawJson?.postCardProvenance).toEqual({
      light: { renderer: "xeet", captureTweetVersion: 13 },
      dark: { renderer: "xeet", captureTweetVersion: 13 },
    });
    expect(harness.getStored().rawJson?.postCardRepair).toBeUndefined();
  });

  it("survives the stored rawJson schema used by source.json", () => {
    const parsed = StoredRawJsonSchema.parse({
      capture: postRaw().capture,
      postCardProvenance: {
        light: { renderer: "xeet", captureTweetVersion: 13 },
        dark: { renderer: "screenshot", captureTweetVersion: 13 },
      },
      postCardRepair: { version: 1, attemptedAt: "2026-11-16T00:00:00.000Z" },
    });

    expect(parsed.postCardProvenance?.light?.renderer).toBe("xeet");
    expect(parsed.postCardProvenance?.dark?.renderer).toBe("screenshot");
    expect(parsed.postCardRepair?.version).toBe(1);
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

  it("screenshots a reply without the parent post when the structured card misses", async () => {
    const harness = makePorts(
      save(replyRaw()),
      {
        light: { ok: true, png: rendered },
        dark: { ok: true, png: rendered },
      },
      { structuredCardMisses: true },
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
      { structuredCardMisses: true },
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
