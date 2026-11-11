/** Save rows, loading, and mutations without Save UI, so Enrichment and Search can depend on them without a cycle. */
export {
  useBootReady,
  useRetainedSaves,
  useSave,
  useSavePaging,
  useSaves,
} from "./hooks/use-saves";
export {
  ensureSaves,
  invalidatePendingSaveHydration,
  reloadSaves,
} from "./lib/ensure-saves";
export { bulkMutation, mutateSave, trashSaves } from "./lib/mutate";
export {
  onPoolDirty,
  pool,
  protectSaves,
  savesStore,
  upsertSave,
} from "./state/pool";
