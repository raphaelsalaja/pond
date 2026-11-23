import type { TransferJob } from "@shared/transfer-contracts";
import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { buildTransferMenuItems } from "./transfer-menu";

function job(status: TransferJob["status"], error: string | null = null) {
  return {
    id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    request: {
      kind: "export_files",
      origin: "/Users/user/Pond",
      destination: "/Users/user/Downloads/Geoid (Pond Export 2026-11-22)",
    },
    status,
    phase: "Copying files",
    completed: 1,
    total: 2,
    bytes: 0,
    currentFile: null,
    error,
    startedAt: 1,
    updatedAt: 2,
  } satisfies TransferJob;
}

function labels(status: TransferJob["status"], error?: string) {
  return buildTransferMenuItems(job(status, error), new QueryClient()).flatMap(
    (item) => ("label" in item && !item.hidden ? [item.label] : []),
  );
}

it("offers Show in Finder for a finished export", () => {
  expect(labels("completed")).toEqual([
    "Show in Finder",
    "Copy Path",
    "Dismiss",
  ]);
});

it("offers Cancel only while a transfer runs", () => {
  expect(labels("running")).toEqual(["Cancel Transfer", "Copy Path"]);
  expect(labels("cancelling")).toEqual(["Copy Path"]);
});

it("offers Retry and the error for a failed transfer", () => {
  expect(labels("failed", "Disk full")).toEqual([
    "Retry Transfer",
    "Copy Path",
    "Copy Error",
    "Dismiss",
  ]);
  expect(labels("interrupted")).toEqual([
    "Retry Transfer",
    "Copy Path",
    "Dismiss",
  ]);
});
