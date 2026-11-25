import { Menu } from "electron";
import type { RecentMenuEntry } from "../../shared/constants";
import type { AppMenuRuntimeDeps } from "./runtime";
import { createAppMenuContext } from "./runtime";
import { buildAppMenuTemplate } from "./template";

export function applyAppMenu(
  deps: AppMenuRuntimeDeps,
  recentEntries: Array<RecentMenuEntry>,
): void {
  const context = createAppMenuContext(deps);
  const template = buildAppMenuTemplate(context, recentEntries);
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
