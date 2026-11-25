import { z } from "zod";
import { SavePatchesSchema } from "../lib/reconcile";
import { readSnapshot, scheduleSnapshotWrite } from "../lib/snapshot";
import { applyActionCoalesced } from "../lib/sync-coalesce";
import { createSaveBootstrap } from "./save-bootstrap";

const Page = z.object({
  rows: SavePatchesSchema.catch([]),
  nextCursor: z
    .object({ savedAt: z.number(), id: z.string() })
    .nullish()
    .catch(null),
  total: z.number().nullish().catch(null),
});

export function createPoolBootstrap() {
  return createSaveBootstrap({
    readSnapshot,
    scheduleSnapshotWrite,
    applyActionCoalesced,
    rendererReady: () => window.pond.rendererReady(),
    onSyncAction: (callback) => window.pond.onSyncAction(callback),
    loadAll: async () =>
      SavePatchesSchema.parse(await window.pond.query("saves.list", {})),
    loadPage: async (params) =>
      Page.parse(await window.pond.query("saves.listPage", params)),
  });
}

export const { bootPool, pagingStore } = createPoolBootstrap();
