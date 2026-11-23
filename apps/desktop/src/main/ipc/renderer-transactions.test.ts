import type { Transaction } from "@pond/schema/tx";
import { expect, it } from "vitest";
import { assertRendererTransactions } from "./renderer-transactions";

const update: Transaction = {
  kind: "update",
  model: "save",
  id: "save-1",
  patch: { title: "Renamed" },
  before: { title: "Original" },
};

it("accepts renderer transactions that only carry bytes", () => {
  expect(() => assertRendererTransactions([update])).not.toThrow();
});

it("rejects renderer transactions that move files from a path", () => {
  expect(() =>
    assertRendererTransactions([
      update,
      {
        ...update,
        fileMoves: [{ sourcePath: "/etc/passwd", filename: "video-1.mp4" }],
      },
    ]),
  ).toThrow();
});
