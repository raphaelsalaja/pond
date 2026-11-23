import { ipcMain } from "electron";
import { IPC } from "../../../shared/constants";
import { HapticPatternSchema } from "../../../shared/haptics";
import { performHaptic } from "../../core/haptics";
import { isTrustedSender } from "../helpers";

export function registerHapticHandlers(): void {
  ipcMain.on(IPC.haptic, (event, raw) => {
    if (!isTrustedSender(event)) return;
    const pattern = HapticPatternSchema.safeParse(raw);
    if (pattern.success) performHaptic(pattern.data);
  });
}
