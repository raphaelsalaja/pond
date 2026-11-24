import { z } from "zod";
import {
  FishIdSchema,
  FishPatchSchema,
  FishPlacementSchema,
  FishSectionSchema,
} from "../../../shared/fish-contracts";
import type { QueryResult } from "../../../shared/query-contracts";
import { announceFishChanged, fishPresence } from "../../core/fish/presence";
import {
  arrangeFish,
  createFish,
  deleteFish,
  deleteRoutine,
  listFish,
  listFishSections,
  markFishSeen,
  readFish,
  setFishSections,
  setRoutinePaused,
  updateFish,
} from "../../core/fish/store";
import { query } from "./params";

const Id = z.object({ id: FishIdSchema });
const RoutineId = Id.extend({ routineId: z.string().min(1).max(64) });

export const fishQueries = {
  "fish.list": query(z.object({}), async () => {
    const { latestFishMessages } = await import("../../core/agent/persist");
    const latest = await latestFishMessages();
    return listFish().map((fish) => ({
      ...fish,
      activity: fishPresence(fish.id),
      latest: latest.get(fish.id) ?? null,
    }));
  }),
  "fish.create": query(FishPatchSchema, (patch) => {
    const fish = createFish(patch);
    announceFishChanged();
    return fish;
  }),
  "fish.update": query(
    Id.extend({ patch: FishPatchSchema }),
    ({ id, patch }) => {
      const fish = updateFish(id, patch);
      announceFishChanged();
      return fish;
    },
  ),
  "fish.delete": query(
    Id,
    async ({ id }): Promise<QueryResult<"fish.delete">> => {
      const result = deleteFish(id);
      if (!result.ok) {
        return result;
      }
      const { deleteFishChats } = await import("../../core/agent/persist");
      await deleteFishChats(id);
      announceFishChanged();
      return result;
    },
  ),
  "fish.markSeen": query(Id, ({ id }) => {
    markFishSeen(id);
    announceFishChanged();
    return { ok: true as const };
  }),
  "fish.run": query(
    RoutineId,
    async ({ id, routineId }): Promise<QueryResult<"fish.run">> => {
      const fish = readFish(id);
      if (!fish) {
        return { ok: false, error: "This fish no longer exists." };
      }
      const routine = fish.routines.find((entry) => entry.id === routineId);
      if (!routine) {
        return { ok: false, error: "This routine no longer exists." };
      }
      if (fishPresence(id)) {
        return { ok: false, error: `${fish.name} is already working.` };
      }
      const { runFishRoutine } = await import("../../core/fish/routines");
      void runFishRoutine(fish, routine, { kind: "manual" });
      return { ok: true };
    },
  ),
  "fish.pauseRoutine": query(
    RoutineId.extend({ paused: z.boolean() }),
    ({ id, routineId, paused }) => {
      const fish = setRoutinePaused(id, routineId, paused);
      announceFishChanged();
      return fish;
    },
  ),
  "fish.deleteRoutine": query(RoutineId, ({ id, routineId }) => {
    const { fish } = deleteRoutine(id, routineId);
    announceFishChanged();
    return fish;
  }),
  "fish.arrange": query(
    z.object({ placements: z.array(FishPlacementSchema).max(1000) }),
    ({ placements }) => {
      arrangeFish(placements);
      announceFishChanged();
      return { ok: true as const };
    },
  ),
  "fish.sections": query(z.object({}), () => listFishSections()),
  "fish.setSections": query(
    z.object({ sections: z.array(FishSectionSchema).max(200) }),
    ({ sections }) => {
      const next = setFishSections(sections);
      announceFishChanged();
      return next;
    },
  ),
};
