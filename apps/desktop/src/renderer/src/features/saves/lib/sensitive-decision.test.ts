import { manualSensitiveDecision } from "@pond/schema/content-safety";
import { afterEach, expect, it, vi } from "vitest";
import { pool } from "@/features/saves/state/pool";
import { normalise, SavePatchSchema } from "./reconcile";
import { setSensitiveDecision } from "./sensitive-decision";

function save(sensitiveScore: number) {
  const row = normalise(
    SavePatchSchema.parse({
      id: "saved",
      url: "https://example.com",
      sensitiveScore,
      sensitiveModel: "model@revision",
    }),
  );
  if (!row) throw new Error("Fixture must produce a save");
  return row;
}

afterEach(() => {
  pool.clear();
  vi.unstubAllGlobals();
});

it("persists a correction and keeps it when the write fails", async () => {
  pool.upsert(save(0.99));
  const cleared = manualSensitiveDecision(false);
  const query = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal("window", {
    pond: { query },
    dispatchEvent: () => true,
  });

  await setSensitiveDecision(["saved"], false);

  expect(pool.get("saved")?.sensitiveScore).toBe(0);
  expect(pool.get("saved")?.sensitiveModel).toBe(cleared.sensitiveModel);
  expect(query).toHaveBeenCalledWith("saves.patchDerived", {
    id: "saved",
    patch: cleared,
  });

  query.mockRejectedValueOnce(new Error("Library unavailable"));
  await setSensitiveDecision(["saved"], true);
  expect(pool.get("saved")?.sensitiveScore).toBe(0);
  expect(pool.get("saved")?.sensitiveModel).toBe(cleared.sensitiveModel);
});
