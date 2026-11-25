import { manualSensitiveDecision } from "@pond/schema/content-safety";
import { afterEach, expect, it } from "vitest";
import { pool } from "@/features/saves/state/pool";
import { bridge } from "@/shared/test/pond-bridge";
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
  if (!row) {
    throw new Error("Fixture must produce a save");
  }
  return row;
}

afterEach(() => {
  pool.clear();
});

it("persists a correction and keeps it when the write fails", async () => {
  pool.upsert(save(0.99));
  const cleared = manualSensitiveDecision(false);
  let available = true;
  bridge.use({
    query: {
      "saves.patchDerived": async () => {
        if (!available) {
          throw new Error("Library unavailable");
        }
        return { ok: true };
      },
    },
  });

  await setSensitiveDecision(["saved"], false);

  expect(pool.get("saved")?.sensitiveScore).toBe(0);
  expect(pool.get("saved")?.sensitiveModel).toBe(cleared.sensitiveModel);
  expect(window.pond.query).toHaveBeenCalledWith("saves.patchDerived", {
    id: "saved",
    patch: cleared,
  });

  available = false;
  await setSensitiveDecision(["saved"], true);
  expect(pool.get("saved")?.sensitiveScore).toBe(0);
  expect(pool.get("saved")?.sensitiveModel).toBe(cleared.sensitiveModel);
});
