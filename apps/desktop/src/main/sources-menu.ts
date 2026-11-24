import { SOURCES, sourceLabel } from "@pond/schema";
import log from "electron-log/main.js";
import type { MenuActionId } from "../shared/constants";
import type { ShortcutId } from "../shared/shortcuts";
import { syncAllSources, syncSource } from "./core/sync";

interface SourcesMenuOptions {
  accelerator: (id: ShortcutId) => string | undefined;
  sendMenuAction: (
    id: MenuActionId,
  ) => NonNullable<Electron.MenuItemConstructorOptions["click"]>;
}

export function sourcesSubmenu({
  accelerator,
  sendMenuAction,
}: SourcesMenuOptions): Array<Electron.MenuItemConstructorOptions> {
  const syncItems: Array<Electron.MenuItemConstructorOptions> = SOURCES.filter(
    (source) => source !== "local",
  ).map((source) => ({
    label: `Sync ${sourceLabel(source)}`,
    click: () => {
      void syncSource(source, { trigger: "manual" }).catch((cause: unknown) =>
        log.warn(`[pond menu] sync ${source} failed`, cause),
      );
    },
  }));
  return [
    {
      label: "Sync All",
      accelerator: accelerator("sources.sync-all"),
      registerAccelerator: false,
      click: () => void syncAllSources({ trigger: "manual" }),
    },
    ...syncItems,
    { type: "separator" },
    {
      label: "Refresh All Metadata",
      click: sendMenuAction("refresh.all"),
    },
    {
      label: "Cancel Metadata Refresh",
      click: sendMenuAction("refresh.cancel"),
    },
  ];
}
