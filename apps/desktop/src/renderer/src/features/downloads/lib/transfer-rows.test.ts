import type { TransferJob } from "@shared/transfer-contracts";
import { expect, it } from "vitest";
import { matchesDownloadFilters, type StatusFilter } from "./status-feed";
import {
  transferRevealable,
  transferStatusLabel,
  transferToDownloadRow,
} from "./transfer-rows";

function job(overrides: Partial<TransferJob> = {}): TransferJob {
  return {
    id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    request: {
      kind: "export_files",
      origin: "/Users/user/Pond",
      destination: "/Users/user/Downloads/Geoid (Pond Export 2026-11-22)",
    },
    status: "running",
    phase: "Copying files",
    completed: 3,
    total: 12,
    bytes: 0,
    currentFile: null,
    error: null,
    startedAt: 1_000,
    updatedAt: 4_000,
    ...overrides,
  };
}

it("shows a running export as an active Downloads row", () => {
  const row = transferToDownloadRow(job());
  expect(row).toMatchObject({
    id: "transfer:01ARZ3NDEKTSV4RRFFQ69G5FAV",
    name: "Geoid (Pond Export 2026-11-22)",
    status: "running",
    stage: "Export Files",
    progress: 0.25,
    durationMs: null,
    live: true,
  });
  expect(transferStatusLabel(job())).toBe("Copying files 3 of 12");
});

it("maps finished transfers onto Downloads statuses", () => {
  expect(transferToDownloadRow(job({ status: "completed" }))).toMatchObject({
    status: "complete",
    durationMs: 3_000,
    live: false,
  });
  expect(transferToDownloadRow(job({ status: "interrupted" })).status).toBe(
    "failed",
  );
  expect(
    transferToDownloadRow(job({ status: "cancelled", error: "Canceled." })),
  ).toMatchObject({ status: "cancelled", error: null });
  expect(transferStatusLabel(job({ status: "cancelling" }))).toBe("Canceling");
});

it("follows the Downloads status and search filters", () => {
  const row = transferToDownloadRow(job({ status: "completed" }));
  const filters = {
    statuses: new Set<StatusFilter>(),
    sources: new Set<never>(),
    q: "",
  };
  expect(
    matchesDownloadFilters(row, {
      ...filters,
      statuses: new Set<StatusFilter>(["active"]),
    }),
  ).toBe(false);
  expect(
    matchesDownloadFilters(row, {
      ...filters,
      statuses: new Set<StatusFilter>(["complete"]),
    }),
  ).toBe(true);
  expect(matchesDownloadFilters(row, { ...filters, q: "export files" })).toBe(
    true,
  );
  expect(matchesDownloadFilters(row, { ...filters, q: "geoid" })).toBe(true);
});

it("reveals only completed exports", () => {
  expect(transferRevealable(job({ status: "completed" }))).toBe(true);
  expect(transferRevealable(job())).toBe(false);
  expect(
    transferRevealable(
      job({
        status: "completed",
        request: { ...job().request, kind: "import_package" },
      }),
    ),
  ).toBe(false);
});
