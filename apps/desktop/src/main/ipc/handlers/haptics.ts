import { ipcMain } from "electron";
import { IPC } from "../../../shared/constants";
import { HapticPatternSchema } from "../../../shared/haptics";
import { performHaptic } from "../../core/haptics";

export function registerHapticHandlers(): void {
  ipcMain.on(IPC.haptic, (_event, raw) => {
    const pattern = HapticPatternSchema.safeParse(raw);
    if (pattern.success) performHaptic(pattern.data);
  });
}
