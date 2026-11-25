import { ShareMenu } from "electron";
import type { BaseWindow, SharingItem } from "electron";

type ShareMenuInstance = Pick<ShareMenu, "popup">;
type ShareMenuFactory = (sharingItem: SharingItem) => ShareMenuInstance;

const activeShareMenus = new Set<ShareMenuInstance>();

const createShareMenu: ShareMenuFactory = (sharingItem) =>
  new ShareMenu(sharingItem);

export function showNativeShareMenu(
  filePath: string,
  parentWindow?: BaseWindow,
  createMenu: ShareMenuFactory = createShareMenu,
): void {
  const menu = createMenu({ filePaths: [filePath] });
  activeShareMenus.add(menu);
  menu.popup({
    window: parentWindow,
    callback: () => activeShareMenus.delete(menu),
  });
}
