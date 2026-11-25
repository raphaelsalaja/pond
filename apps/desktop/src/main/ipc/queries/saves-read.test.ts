import type { Op } from "@pond/schema/db";
import { describe, expect, it } from "vitest";
import { orderTasksInPipelineOrder } from "./saves-read";

function row(op: Op) {
  return { op };
}

describe("orderTasksInPipelineOrder", () => {
  it("orders a Save's tasks by the canonical pipeline sequence", () => {
    const rows = [
      row("fetch_blobs"),
      row("finalize"),
      row("harvest_metadata"),
      row("ensure_poster"),
    ];
    expect(orderTasksInPipelineOrder(rows).map((t) => t.op)).toEqual([
      "harvest_metadata",
      "fetch_blobs",
      "ensure_poster",
      "finalize",
    ]);
  });

  it("keeps duplicate ops in their original relative order", () => {
    const first = { ...row("fetch_blobs"), marker: 1 };
    const second = { ...row("fetch_blobs"), marker: 2 };
    const rows = orderTasksInPipelineOrder([
      second,
      row("harvest_metadata"),
      first,
    ]);
    expect(rows.filter((t) => t.op === "fetch_blobs")).toEqual([second, first]);
  });
});
