import { ipcMain } from "electron";
import { IPC } from "../../../shared/constants";
import { isHapticPattern } from "../../../shared/haptics";
import { performHaptic } from "../../core/haptics";

export function registerHapticHandlers(): void {
  ipcMain.on(IPC.haptic, (_event, pattern: unknown) => {
    if (isHapticPattern(pattern)) performHaptic(pattern);
  });
}
