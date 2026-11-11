import { describe, expect, it } from "vitest";
import type { ThreadsListKind } from "../refresh/harvest/threads/list";
import type {
  SavedHarvestArgs,
  SavedHarvestResult,
} from "../refresh/harvest/threads/saved-types";
import { listHarvestPlan } from "./import-scope";
import {
  harvestThreadsLists,
  type ThreadsListHarvester,
  threadsListKinds,
} from "./threads-lists";

const SAVED_PAGE: SavedHarvestResult = {
  ok: true,
  entries: [
    { postId: "SavedOnly01", url: "https://www.threads.com/t/SavedOnly01" },
    { postId: "Both000001", url: "https://www.threads.com/t/Both000001" },
  ],
  captures: [],
  reachedEnd: true,
};

const LIKED_PAGE: SavedHarvestResult = {
  ok: true,
  entries: [
    { postId: "Both000001", url: "https://www.threads.com/t/Both000001" },
    { postId: "LikedOnly1", url: "https://www.threads.com/t/LikedOnly1" },
  ],
  captures: [],
  reachedEnd: true,
};

function fakeThreads(
  pages: Partial<Record<ThreadsListKind, SavedHarvestResult>>,
) {
  const calls: Array<{ kind: ThreadsListKind; args: SavedHarvestArgs }> = [];
  const harvest: ThreadsListHarvester = async (kind, args) => {
    calls.push({ kind, args });
    return pages[kind] ?? { ok: false, reason: "no_match" };
  };
  return { calls, harvest };
}

const live = (): AbortSignal => new AbortController().signal;

describe("threadsListKinds", () => {
  it("reads Saved Posts and Liked Posts when the scope is omitted", () => {
    expect(threadsListKinds(listHarvestPlan("threads", undefined))).toEqual([
      "saved",
      "liked",
    ]);
  });

  it("reads only the lists you keep", () => {
    expect(
      threadsListKinds(listHarvestPlan("threads", { listKinds: ["liked"] })),
    ).toEqual(["liked"]);
    expect(
      threadsListKinds(listHarvestPlan("threads", { listKinds: ["saved"] })),
    ).toEqual(["saved"]);
    expect(
      threadsListKinds(listHarvestPlan("threads", { listKinds: [] })),
    ).toEqual([]);
  });
});

describe("harvestThreadsLists", () => {
  it("labels each post with every list it came from", async () => {
    const threads = fakeThreads({ saved: SAVED_PAGE, liked: LIKED_PAGE });
    const result = await harvestThreadsLists(
      ["saved", "liked"],
      { knownIds: ["Old0000001"] },
      threads.harvest,
      live(),
    );
    expect(result).toEqual({
      ok: true,
      gaps: [],
      entries: [
        expect.objectContaining({
          postId: "SavedOnly01",
          listKinds: ["saved"],
        }),
        expect.objectContaining({
          postId: "Both000001",
          listKinds: ["liked", "saved"],
        }),
        expect.objectContaining({ postId: "LikedOnly1", listKinds: ["liked"] }),
      ],
    });
    expect(threads.calls).toEqual([
      { kind: "saved", args: { knownIds: ["Old0000001"] } },
      { kind: "liked", args: { knownIds: ["Old0000001"] } },
    ]);
  });

  it("never opens a list you leave out", async () => {
    const threads = fakeThreads({ saved: SAVED_PAGE, liked: LIKED_PAGE });
    const result = await harvestThreadsLists(
      ["liked"],
      { knownIds: [] },
      threads.harvest,
      live(),
    );
    expect(threads.calls.map((call) => call.kind)).toEqual(["liked"]);
    expect(result.ok && result.entries.map((e) => e.listKinds)).toEqual([
      ["liked"],
      ["liked"],
    ]);
  });

  it("fails the run when the first list you import can't be read", async () => {
    const threads = fakeThreads({
      saved: { ok: false, reason: "rate_limited", retryAfterSec: 120 },
      liked: LIKED_PAGE,
    });
    expect(
      await harvestThreadsLists(
        ["saved", "liked"],
        { knownIds: [] },
        threads.harvest,
        live(),
      ),
    ).toEqual({
      ok: false,
      kind: "saved",
      reason: "rate_limited",
      retryAfterSec: 120,
    });
    expect(threads.calls.map((call) => call.kind)).toEqual(["saved"]);
  });

  it("names the list that failed when Liked Posts is the only one", async () => {
    const threads = fakeThreads({
      liked: { ok: false, reason: "auth_required" },
    });
    expect(
      await harvestThreadsLists(
        ["liked"],
        { knownIds: [] },
        threads.harvest,
        live(),
      ),
    ).toEqual({ ok: false, kind: "liked", reason: "auth_required" });
  });

  it("keeps Saved Posts and notes the gap when Liked Posts fails after it", async () => {
    const threads = fakeThreads({
      saved: SAVED_PAGE,
      liked: { ok: false, reason: "timeout" },
    });
    const result = await harvestThreadsLists(
      ["saved", "liked"],
      { knownIds: [] },
      threads.harvest,
      live(),
    );
    expect(result).toMatchObject({
      ok: true,
      gaps: [{ kind: "liked", reason: "timeout" }],
    });
    expect(result.ok && result.entries.map((e) => e.postId)).toEqual([
      "SavedOnly01",
      "Both000001",
    ]);
  });

  it("stops before the next list once the run is cancelled", async () => {
    const controller = new AbortController();
    const calls: ThreadsListKind[] = [];
    const result = await harvestThreadsLists(
      ["saved", "liked"],
      { knownIds: [] },
      async (kind) => {
        calls.push(kind);
        controller.abort();
        return SAVED_PAGE;
      },
      controller.signal,
    );
    expect(calls).toEqual(["saved"]);
    expect(result.ok).toBe(true);
  });

  it("reads nothing when every list is off", async () => {
    const threads = fakeThreads({ saved: SAVED_PAGE, liked: LIKED_PAGE });
    expect(
      await harvestThreadsLists([], { knownIds: [] }, threads.harvest, live()),
    ).toEqual({ ok: true, entries: [], gaps: [] });
    expect(threads.calls).toEqual([]);
  });
});
