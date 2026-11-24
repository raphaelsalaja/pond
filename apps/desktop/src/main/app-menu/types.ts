import type { MenuItemConstructorOptions } from "electron";
import type { MenuActionId } from "../../shared/constants";
import type { ShortcutId } from "../../shared/shortcuts";

export type AppMenuItem = MenuItemConstructorOptions;

export interface AppMenuContext {
  accelerator: (id: ShortcutId) => string | undefined;
  appName: string;
  developer: {
    toggleReactScan: () => void;
  };
  edit: {
    copy: () => void;
    cut: () => void;
    paste: () => void;
    redo: () => void;
    selectAll: () => void;
    undo: () => void;
  };
  isMac: boolean;
  isPackaged: boolean;
  navTo: (path: string) => () => void;
  openExternalUrl: (url: string) => () => void;
  openLibraryWindow: () => void;
  openRecent: (id: string) => () => void;
  rescanLibrary: () => void;
  reloadLibrary: () => void;
  revealLibrary: () => void;
  sendMenuAction: (
    id: MenuActionId,
  ) => NonNullable<MenuItemConstructorOptions["click"]>;
  showLogs: () => void;
  verifyLibrary: () => void;
}
