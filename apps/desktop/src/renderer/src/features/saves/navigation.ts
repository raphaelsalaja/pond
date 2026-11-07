/** Opening Saves and selection state without Save UI, for the Harvester window's Downloads views. */
export {
  closeSave,
  followDeparture,
  openSave,
  saveIdFromPath,
  stepSave,
} from "./lib/save-nav";
export { resultNavigation, useResultTotal } from "./state/result-navigation";
export {
  primarySelection,
  primarySelectionStore,
  selection,
  useSelectionCursor,
  useSelectionSize,
} from "./state/selection";
