import { app } from "electron";
import log from "electron-log/main.js";
import { planRelaunch, spawnRelaunch } from "./relaunch";

/**
 * Restarts Pond into the Library that the persisted pointers now name.
 * @remarks Electron's `app.relaunch` starts its child with `no_new_privs`, which stops the AppImage runtime's setuid `fusermount` helper from mounting the image. The Linux build ships as an AppImage, so spawn that image directly instead.
 */
export function relaunchApp(): void {
  const plan = planRelaunch();
  if (plan.kind === "electron") {
    app.relaunch();
    return;
  }
  spawnRelaunch(plan, {
    onError: (error) => log.error("[pond] AppImage relaunch failed", error),
  });
}
