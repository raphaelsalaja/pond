import type { LibraryRepairKind } from "@shared/library-repair-contracts";
import { newMenuDialog } from "./state/new-menu-dialog";

export function openLibraryRepair(
  kind: LibraryRepairKind,
  options: { saveIds?: ReadonlyArray<string>; onClosed?: () => void } = {},
): void {
  newMenuDialog.open({ kind: "repair", repair: kind, ...options });
}
