import { afterEach, expect, it, vi } from "vitest";
import { pool } from "../state/pool";
import { rateSaves } from "./rating";
import { normalise, SavePatchSchema } from "./reconcile";

function seed(id: string, rating: number | null) {
  const save = normalise(SavePatchSchema.parse({ id, title: id, rating }));
  if (!save) {
    throw new Error("Invalid fixture");
  }
  pool.upsert(save);
}
afterEach(() => {
  pool.clear();
  vi.unstubAllGlobals();
});
it("rates every explicit ID while updating only loaded cards optimistically", async () => {
  seed("a", 1);
  const ids = [
    "a",
    ...Array.from({ length: 300 }, (_, index) => `cold-${index}`),
  ];
  const pending = Promise.withResolvers<{ changed: number }>();
  const query = vi.fn(() => pending.promise);
  vi.stubGlobal("window", { pond: { query } });
  const operation = rateSaves([...ids, "a"], 4);
  expect(pool.get("a")?.rating).toBe(4);
  expect(pool.snapshot()).toHaveLength(1);
  expect(query).toHaveBeenCalledWith("saves.bulkEdit", {
    ids,
    operation: { kind: "rating", rating: 4 },
  });
  pending.resolve({ changed: ids.length });
  await operation;
});
it("rolls back and rejects failures so rate-and-advance cannot move ahead", async () => {
  seed("a", 3);
  vi.stubGlobal("window", {
    pond: {
      query: async () => {
        throw new Error("Disk unavailable");
      },
    },
  });
  await expect(rateSaves(["a"], 0)).rejects.toThrow("Disk unavailable");
  expect(pool.get("a")?.rating).toBe(3);
});
it("clears ratings with zero and rejects invalid values before IPC", async () => {
  seed("a", 3);
  const query = vi.fn(async () => ({ changed: 1 }));
  vi.stubGlobal("window", { pond: { query } });
  await rateSaves(["a"], 0);
  expect(pool.get("a")?.rating).toBeNull();
  await expect(rateSaves(["a"], 6)).rejects.toThrow("between 0 and 5");
  expect(query).toHaveBeenCalledTimes(1);
});
