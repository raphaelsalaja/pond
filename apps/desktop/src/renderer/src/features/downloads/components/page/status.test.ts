import { describe, expect, it, vi } from "vitest";
import type { DownloadRow } from "@/features/downloads/lib/status-feed";
import { downloadStatusLabel } from "./status";

function row(
  status: DownloadRow["status"],
  extras: Partial<DownloadRow> = {},
): DownloadRow {
  return {
    id: status,
    saveId: status,
    name: status,
    url: "https://example.com",
    source: "web",
    status,
    stage: null,
    op: null,
    progress: null,
    attempts: 0,
    error: null,
    ts: 0,
    durationMs: null,
    live: true,
    ...extras,
  };
}

describe("downloadStatusLabel", () => {
  it("uses short table labels", () => {
    expect(downloadStatusLabel(row("waiting"), false)).toBe("Waiting");
    expect(downloadStatusLabel(row("waiting"), true)).toBe("Paused");
    expect(
      downloadStatusLabel(row("waiting", { interactive: true }), true),
    ).toBe("Waiting");
    expect(downloadStatusLabel(row("running"), false)).toBe("In Progress");
    expect(
      downloadStatusLabel(
        row("running", { stage: "Reading page", op: "harvest_metadata" }),
        false,
      ),
    ).toBe("In Progress");
    expect(downloadStatusLabel(row("retrying"), false)).toBe("Retrying");
    vi.spyOn(Date, "now").mockReturnValue(0);
    expect(
      downloadStatusLabel(row("retrying", { nextRunAt: 180_000 }), false),
    ).toBe("Retrying in 3m");
    vi.restoreAllMocks();
    expect(downloadStatusLabel(row("blocked"), false)).toBe("Failed");
    expect(downloadStatusLabel(row("failed"), false)).toBe("Failed");
    expect(downloadStatusLabel(row("dead", { attempts: 1 }), false)).toBe(
      "Failed",
    );
    expect(downloadStatusLabel(row("complete"), false)).toBe("Completed");
    expect(downloadStatusLabel(row("cancelled"), false)).toBe("Canceled");
    expect(downloadStatusLabel(row("skipped"), false)).toBe("Skipped");
  });
});
