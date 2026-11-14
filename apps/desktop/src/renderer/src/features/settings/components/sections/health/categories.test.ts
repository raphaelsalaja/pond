import type {
  LibraryHealthCheck,
  LibraryHealthOverview,
  MediaWarmSnapshot,
} from "@shared/library-health-contracts";
import { describe, expect, it } from "vitest";
import type {
  DownloadHealthRow,
  DownloadRow,
} from "@/features/downloads/health";
import {
  buildHealthCategories,
  type HealthCategory,
  type HealthCategoryId,
  type HealthInput,
  healthTotals,
  STATUS_LABELS,
} from "./categories";

const MEDIA: MediaWarmSnapshot = {
  state: "complete",
  prepared: 0,
  remaining: 0,
  currentTitle: null,
  pauseReason: null,
  lastError: null,
  pendingPosters: 0,
  activeSaveIds: [],
  discovering: false,
  failures: [],
};

const CHECK: LibraryHealthCheck = {
  checkedAt: 1,
  durationMs: 1,
  saves: 10,
  counts: {
    thumbnails: 1,
    "physical-file-names": 0,
    "invalid-content": 1,
    "save-metadata": 0,
    posters: 3,
    unverified: 1,
  },
  issues: [
    {
      kind: "invalid-content",
      saveId: "gone",
      title: "Gone",
      summary: "Files are missing or damaged",
      detail: "Every original file is missing.",
      originals: "unusable",
      files: [
        {
          path: "gone.png",
          kind: "image",
          expectedSize: 10,
          foundSize: null,
          finding: "missing",
        },
      ],
    },
    {
      kind: "thumbnails",
      saveId: "stale",
      title: "Stale",
      summary: "Thumbnail is damaged",
      detail: "Pond rebuilds it.",
      originals: "usable",
      files: [
        {
          path: "stale.png",
          kind: "image",
          expectedSize: 10,
          foundSize: 10,
          finding: "ok",
        },
        {
          path: "stale.png_thumbnail.png",
          kind: "thumbnail",
          expectedSize: 4,
          foundSize: 0,
          finding: "empty",
        },
      ],
    },
  ],
  posters: [
    { saveId: "p-failed", title: "Failed", videos: 1, posters: 0 },
    { saveId: "p-active", title: "Active", videos: 1, posters: 0 },
    { saveId: "p-waiting", title: "Waiting", videos: 2, posters: 1 },
  ],
  unverified: [{ saveId: "locked", title: "Locked", reason: "EACCES" }],
  index: { orphans: ["stray"], missing: [], unreadable: [], backupError: null },
  indexError: null,
};

function row(
  status: DownloadRow["status"],
  extra: Partial<DownloadRow> = {},
): DownloadRow {
  return {
    id: `row-${status}`,
    saveId: `save-${status}`,
    name: `Save ${status}`,
    url: "https://example.com",
    source: "web",
    status,
    stage: null,
    op: null,
    progress: null,
    attempts: 0,
    error: null,
    ts: 1,
    durationMs: null,
    live: true,
    ...extra,
  };
}

function download(
  status: DownloadRow["status"],
  extra: Partial<DownloadRow> = {},
): DownloadHealthRow {
  return { row: row(status, extra), gate: null, reason: `${status} reason` };
}

function input(overrides: Partial<HealthInput> = {}): HealthInput {
  return {
    overview: null,
    downloads: [],
    enrichment: { inflight: 0, failures: [], missingIds: new Set() },
    title: () => null,
    device: "this Mac",
    ...overrides,
  };
}

function category(
  categories: readonly HealthCategory[],
  id: HealthCategoryId,
): HealthCategory {
  const found = categories.find((item) => item.id === id);
  if (!found) throw new Error(`Missing ${id}`);
  return found;
}

describe("Library Health categories", () => {
  it("marks file rows not checked until a check exists", () => {
    const categories = buildHealthCategories(input());
    for (const id of [
      "originals",
      "previews",
      "records",
      "file-names",
      "index",
    ] as const) {
      expect(category(categories, id)).toMatchObject({
        status: "unchecked",
        checked: false,
      });
    }
    expect(category(categories, "downloads").status).toBe("healthy");
  });

  it("shows what each damaged Save expected and found", () => {
    const overview: LibraryHealthOverview = {
      check: CHECK,
      job: null,
      media: MEDIA,
    };
    const categories = buildHealthCategories(input({ overview }));
    const originals = category(categories, "originals");
    expect(originals.status).toBe("damaged");
    expect(originals.total).toBe(2);
    expect(originals.entries.map((entry) => entry.status)).toEqual([
      "damaged",
      "unverified",
    ]);
    expect(originals.entries[0]).toMatchObject({
      repair: "invalid-content",
      originals: "unusable",
      found: "gone.png is missing.",
    });
    expect(category(categories, "previews").entries[0]).toMatchObject({
      originals: "usable",
      found: "stale.png_thumbnail.png is empty.",
      resolution: "repair",
    });
    expect(category(categories, "records").status).toBe("healthy");
    expect(category(categories, "index").entries[0]).toMatchObject({
      saveId: "stray",
      openable: false,
      resolution: "repair",
    });
  });

  it("splits posters into failed, processing, and deferred", () => {
    const overview: LibraryHealthOverview = {
      check: CHECK,
      job: null,
      media: {
        ...MEDIA,
        state: "paused-system",
        pauseReason: "battery",
        activeSaveIds: ["p-active"],
        failures: [
          {
            saveId: "p-failed",
            title: "Failed",
            kind: "poster",
            error: "ffmpeg exited with code 1",
            at: 1,
          },
        ],
      },
    };
    const posters = category(
      buildHealthCategories(input({ overview })),
      "posters",
    );
    const byId = new Map(posters.entries.map((entry) => [entry.saveId, entry]));
    expect(byId.get("p-failed")).toMatchObject({
      status: "failed",
      resolution: "retry",
      reason: "ffmpeg exited with code 1",
    });
    expect(byId.get("p-active")?.status).toBe("processing");
    expect(byId.get("p-waiting")).toMatchObject({
      status: "deferred",
      found: "1 of 2 posters.",
      reason: "Waits until this Mac is plugged in.",
    });
    expect(posters).toMatchObject({ status: "failed", attention: 1 });
  });

  it("maps download states onto the Health taxonomy", () => {
    const categories = buildHealthCategories(
      input({
        downloads: [
          download("running", { progress: 0.5 }),
          download("waiting"),
          download("retrying", { attempts: 2, nextRunAt: 50 }),
          download("parked", {
            id: "auth",
            task: {
              deferredReason: "auth_required",
              attempts: 1,
              maxAttempts: 5,
            },
          }),
          download("parked", {
            id: "budget",
            task: {
              deferredReason: "source_budget",
              attempts: 0,
              maxAttempts: 5,
            },
          }),
          download("failed"),
          download("dead", {
            task: { deferredReason: null, attempts: 5, maxAttempts: 5 },
          }),
          download("complete"),
          download("skipped"),
        ],
      }),
    );
    const downloads = category(categories, "downloads");
    expect(
      downloads.entries.map((entry) => [
        entry.id,
        entry.status,
        entry.resolution,
      ]),
    ).toEqual([
      ["download:row-running", "processing", "wait"],
      ["download:row-waiting", "pending", "wait"],
      ["download:row-retrying", "failed", "wait"],
      ["download:auth", "blocked", "user"],
      ["download:budget", "deferred", "wait"],
      ["download:row-failed", "failed", "retry"],
      ["download:row-dead", "terminal", "retry"],
    ]);
    const dead = downloads.entries.find((entry) => entry.status === "terminal");
    expect(dead).toMatchObject({
      attempts: { count: 5, max: 5 },
      reason: "dead reason",
    });
    expect(
      downloads.entries.find((entry) => entry.id === "download:row-retrying")
        ?.nextAttemptAt,
    ).toBe(50);
    expect(downloads.status).toBe("terminal");
    expect(downloads).toMatchObject({ attention: 4, progress: 3 });
  });

  it("summarizes a download by its error or reason, never its status", () => {
    const { entries } = category(
      buildHealthCategories(
        input({
          downloads: [
            download("dead", { error: "Web fetch 404" }),
            download("failed"),
            { ...download("running"), reason: null },
          ],
        }),
      ),
      "downloads",
    );
    expect(entries.map((entry) => entry.summary)).toEqual([
      "Web fetch 404",
      "failed reason",
      "Not finished",
    ]);
    for (const entry of entries) {
      expect(entry.summary).not.toBe(STATUS_LABELS[entry.status]);
    }
  });

  it("shows no next attempt for a download Pond stopped", () => {
    const { entries } = category(
      buildHealthCategories(
        input({ downloads: [download("dead", { nextRunAt: 99 })] }),
      ),
      "downloads",
    );
    expect(entries[0]?.nextAttemptAt).toBeNull();
  });

  it("leaves processing failures for missing originals to the repair row", () => {
    const processing = category(
      buildHealthCategories(
        input({
          enrichment: {
            inflight: 2,
            failures: [
              {
                key: "ocr:a",
                saveId: "a",
                title: "A",
                task: "ocr",
                reason: "Model crashed",
              },
              {
                key: "ocr:b",
                saveId: "b",
                title: "B",
                task: "ocr",
                reason: "Couldn't finish",
              },
            ],
            missingIds: new Set(["b"]),
          },
        }),
      ),
      "processing",
    );
    expect(processing.entries).toHaveLength(1);
    expect(processing.entries[0]).toMatchObject({
      summary: "Text in Images couldn't finish",
      reason: "Model crashed",
    });
    expect(processing).toMatchObject({ attention: 1, progress: 2 });
  });

  it("totals attention and progress across categories", () => {
    const totals = healthTotals(
      buildHealthCategories(
        input({ downloads: [download("failed"), download("waiting")] }),
      ),
    );
    expect(totals).toEqual({ attention: 1, progress: 1 });
  });
});
