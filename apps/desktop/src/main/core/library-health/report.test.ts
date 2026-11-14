import { describe, expect, it } from "vitest";
import type { LibraryHealthOverview } from "../../../shared/library-health-contracts";
import { debugReportHealth } from "./report";

const OVERVIEW: LibraryHealthOverview = {
  check: {
    checkedAt: Date.UTC(2026, 10, 14),
    durationMs: 1200,
    saves: 3,
    counts: {
      thumbnails: 1,
      "physical-file-names": 0,
      "invalid-content": 1,
      "save-metadata": 0,
      posters: 1,
      unverified: 1,
    },
    issues: [
      {
        kind: "invalid-content",
        saveId: "save-1",
        title: "Private Trip Photos",
        summary: "Files are missing or damaged",
        detail: "Every original file is missing.",
        originals: "unusable",
        files: [
          {
            path: "secret-name.png",
            kind: "image",
            expectedSize: 10,
            foundSize: null,
            finding: "missing",
          },
        ],
      },
    ],
    posters: [{ saveId: "save-2", title: "Holiday", videos: 1, posters: 0 }],
    unverified: [
      {
        saveId: "save-3",
        title: "Diary",
        reason: "EACCES: /Users/me/Library/items/save-3.info/a.png",
      },
    ],
    index: { orphans: ["x"], missing: [], unreadable: [], backupError: null },
    indexError: null,
  },
  job: {
    id: "job",
    status: "completed",
    processed: 3,
    total: 3,
    startedAt: 0,
    error: null,
  },
  media: {
    state: "error",
    prepared: 2,
    remaining: 1,
    currentTitle: "Holiday",
    pauseReason: null,
    lastError: "ffmpeg failed",
    pendingPosters: 0,
    activeSaveIds: [],
    discovering: false,
    failures: [
      {
        saveId: "save-2",
        title: "Holiday",
        kind: "poster",
        error: "ffmpeg failed on /Users/me/clip.mp4",
        at: 0,
      },
    ],
  },
};

describe("Debug Report Library Health", () => {
  it("shares counts, Save IDs, and findings without titles or paths", () => {
    const report = debugReportHealth({
      overview: OVERVIEW,
      queue: null,
      redact: (value) => value.replace(/\/Users\/[^\s]+/g, "<path>"),
    });
    const text = JSON.stringify(report);

    expect(report.check?.counts).toEqual(OVERVIEW.check?.counts);
    expect(report.check?.issues).toEqual([
      {
        kind: "invalid-content",
        saveId: "save-1",
        originals: "unusable",
        files: [
          {
            kind: "image",
            finding: "missing",
            expectedSize: 10,
            foundSize: null,
          },
        ],
      },
    ]);
    expect(report.check?.index).toEqual({
      orphans: 1,
      missing: 0,
      unreadable: 0,
      backupVerified: true,
    });
    expect(report.check?.unverified).toEqual([
      { saveId: "save-3", reason: "EACCES: <path>" },
    ]);
    expect(report.media.failures[0]?.error).toBe("ffmpeg failed on <path>");
    for (const leak of [
      "Private Trip Photos",
      "Holiday",
      "Diary",
      "secret-name.png",
      "/Users/me",
    ]) {
      expect(text).not.toContain(leak);
    }
  });

  it("reports no check when you haven't run one", () => {
    const report = debugReportHealth({
      overview: { ...OVERVIEW, check: null, job: null },
      queue: null,
      redact: (value) => value,
    });
    expect(report.check).toBeNull();
    expect(report.job).toBeNull();
  });
});
