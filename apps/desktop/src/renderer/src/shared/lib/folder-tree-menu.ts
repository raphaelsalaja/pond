import type { MenuItemSpec } from "@pond/ui";
import { createElement } from "react";
import type { ReactNode } from "react";
import { getPrefsSnapshot } from "@/shared/state/prefs";
import { FolderIcon } from "./folder-icons";

export interface FolderTreeEntry {
  id: string;
  name: string;
  parentId?: string | null;
}

function isDisabled(spec: MenuItemSpec): boolean {
  return "disabled" in spec && Boolean(spec.disabled);
}

/** A parent folder leads its own submenu, as in Mail's Move To menu, so it stays a target. */
export function buildFolderTreeMenu(
  folders: ReadonlyArray<FolderTreeEntry>,
  leaf: (folder: FolderTreeEntry, icon: ReactNode) => MenuItemSpec,
): Array<MenuItemSpec> {
  const ids = new Set(folders.map((folder) => folder.id));
  const children = new Map<string | null, Array<FolderTreeEntry>>();
  for (const folder of folders) {
    const parent =
      folder.parentId && ids.has(folder.parentId) ? folder.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), folder]);
  }
  const views = getPrefsSnapshot()?.folderViews ?? {};

  const build = (parent: string | null): Array<MenuItemSpec> =>
    (children.get(parent) ?? [])
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .flatMap((folder): Array<MenuItemSpec> => {
        const icon = createElement(FolderIcon, {
          name: views[folder.id]?.icon,
        });
        const self = leaf(folder, icon);
        const nested = build(folder.id);
        if (!nested.length) {
          return [self];
        }
        return [
          {
            type: "submenu",
            id: folder.id,
            label: folder.name,
            icon,
            disabled: [self, ...nested].every(isDisabled),
            items: [self, { type: "separator" }, ...nested],
          },
        ];
      });

  return build(null);
}
