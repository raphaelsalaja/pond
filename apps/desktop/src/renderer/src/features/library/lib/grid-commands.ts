import { openSaveId } from "@/features/saves/navigation";
import { currentRouteMeta } from "@/shared/lib/route-meta";

/** `search` covers search and filters; `view` covers layout, sort, zoom, subfolders and View Options. */
export type GridCommand = "search" | "view";

/**
 * Whether a Library grid on screen takes `command` from the native menu or a hotkey.
 * @remarks Off the grid, under an open Save, and for `view` in Inbox review, the grid is hidden, so a command would change view state nobody can see.
 */
export function gridTakes(command: GridCommand): boolean {
  if (openSaveId() !== null) return false;
  const meta = currentRouteMeta();
  if (meta?.surface !== "grid") return false;
  return command === "search" || meta.nav?.kind !== "inbox";
}
