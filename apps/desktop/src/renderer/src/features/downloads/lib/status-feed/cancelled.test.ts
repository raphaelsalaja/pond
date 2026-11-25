import { CANCEL_REASON } from "@pond/schema/db";
import type { WireTask } from "@shared/wire";
import { describe, expect, it } from "vitest";
import {
  projectLiveDownloads,
  statusBucket,
} from "@/features/downloads/lib/status-feed";
import type { Save } from "@/features/saves/types";

function save(tasks: Array<WireTask>): Save {
  return {
    id: "s1",
    source: "twitter",
    sourceId: "1",
    url: "https://x.com/a/status/1",
    title: "A tweet",
    description: null,
    notes: null,
    accountId: null,
    author: null,
    mediaType: null,
    mediaUrl: null,
    fileSize: null,
    width: null,
    height: null,
    savedAt: 1,
    createdAt: 1,
    deletedAt: null,
    tags: [],
    files: [],
    status: "failed",
    ingestStartedAt: 1,
    tasks,
  };
}

function task(
  lastError: string | null,
  op: WireTask["op"] = "fetch_blobs",
): WireTask {
  return {
    op,
    status: lastError === CANCEL_REASON ? "cancelled" : "dead",
    attempts: 1,
    maxAttempts: 3,
    lastError,
    nextRunAt: 0,
    updatedAt: 0,
  };
}

describe("cancelled downloads", () => {
  it("reads a user cancel as cancelled, not failed", () => {
    const rows = projectLiveDownloads([save([task(CANCEL_REASON)])]);
    expect(rows[0]?.status).toBe("cancelled");
    expect(statusBucket("cancelled")).toBe("cancelled");
  });

  it("reads an exhausted error as dead", () => {
    const rows = projectLiveDownloads([save([task("TerminalError: no data")])]);
    expect(rows[0]?.status).toBe("dead");
  });

  it("keeps a set with one real error as dead", () => {
    const rows = projectLiveDownloads([
      save([task(CANCEL_REASON), task("boom", "finalize")]),
    ]);
    expect(rows[0]?.status).toBe("dead");
  });
});
