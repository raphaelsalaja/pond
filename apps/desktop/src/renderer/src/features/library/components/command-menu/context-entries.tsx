import {
  IconFolder,
  IconFolderTree,
  IconLayers,
  IconTrashXmark,
  IconUpload,
} from "@pond/icons";
import type { Folder } from "@pond/schema/db";
import { useSelector } from "@tanstack/react-store";
import { useMemo } from "react";
import {
  confirmRemoveFolder,
  exportFolderFiles,
} from "@/features/library/components/folder-context-menu";
import { selectLibraryNav } from "@/features/library/components/folder-sidebar/navigation";
import { buildTrashMenuItems } from "@/features/library/components/folder-sidebar/trash-menu";
import { newFolder } from "@/features/library/components/new-menu/actions";
import { folders, useFolders } from "@/features/library/state/folders";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import {
  setIncludeSubfolders,
  useIncludeSubfolders,
} from "@/features/library/state/view-store";
import { isSaveCollectionPath } from "@/features/saves/lib/list-path";
import { buildSaveMenu } from "@/features/saves/lib/menu";
import { descendantFolderIds } from "@/features/saves/lib/nav-filter";
import { saveIdFromPath } from "@/features/saves/lib/save-nav";
import { savesStore } from "@/features/saves/pool";
import { useResultTotal } from "@/features/saves/state/result-navigation";
import { useSelectedIds } from "@/features/saves/state/selection";
import type { Save } from "@/features/saves/types";
import { tagClipboard } from "@/features/tags";
import { specEntries } from "./spec-entries";
import type { MenuEntry } from "./types";

/** Shown before a query; typing searches every action in the Save menu. */
const SUGGESTED = new Set([
  "Add Tags",
  "Add to Folders",
  "Rename",
  "Rename Saves",
  "Restore from Trash",
  "Move to Trash",
]);

function sameSaves(a: readonly Save[], b: readonly Save[]): boolean {
  return a.length === b.length && a.every((save, i) => save === b[i]);
}

function useFocusedSaves(pathname: string): {
  saves: readonly Save[];
  opened: boolean;
} {
  const openId = saveIdFromPath(pathname);
  const selectedIds = useSelectedIds();
  const ids = openId ? [openId] : selectedIds;
  const saves = useSelector(
    savesStore,
    (state) =>
      ids.flatMap((id) => {
        const save = state.byId.get(id);
        return save ? [save] : [];
      }),
    { compare: sameSaves },
  );
  return { saves, opened: openId !== null };
}

function saveEntries(
  saves: readonly Save[],
  opened: boolean,
  searching: boolean,
): MenuEntry[] {
  if (saves.length === 0) return [];
  const group = opened ? "Current Save" : `${saves.length} Selected`;
  const items = buildSaveMenu(saves, {
    clipboardEmpty: tagClipboard.get().length === 0,
    opened,
  });
  const all = specEntries(items, group, "focus");
  if (searching) return all;
  return [
    ...all.filter((entry) => SUGGESTED.has(entry.label)),
    {
      id: "focus:all-actions",
      group,
      label: "All Actions",
      icon: <IconLayers aria-hidden />,
      page: () => ({
        kind: "actions",
        key: "focus:all-actions",
        title: "All Actions",
        context: group,
        entries: specEntries(items, "", "focus"),
      }),
    },
  ];
}

function folderEntries(
  folder: Folder,
  rows: readonly Folder[],
  includeSubfolders: boolean,
): MenuEntry[] {
  const group = "Current Folder";
  const hasChildren = rows.some((row) => row.parentId === folder.id);
  const entries: MenuEntry[] = [
    {
      id: "folder:new-subfolder",
      group,
      label: "New Subfolder",
      icon: <IconFolder aria-hidden />,
      run: () => newFolder(folder.id),
    },
  ];
  if (hasChildren) {
    entries.push({
      id: "folder:include-subfolders",
      group,
      label: "Include Subfolders",
      icon: <IconFolderTree aria-hidden />,
      checked: includeSubfolders,
      run: () => setIncludeSubfolders(!includeSubfolders),
    });
  }
  entries.push(
    {
      id: "folder:export",
      group,
      label: "Export Files",
      keywords: "folder download copy",
      icon: <IconUpload aria-hidden />,
      run: () =>
        void exportFolderFiles(
          includeSubfolders
            ? [...descendantFolderIds(folder.id, rows)]
            : [folder.id],
        ),
    },
    {
      id: "folder:remove",
      group,
      label: "Remove Folder",
      keywords: "delete",
      icon: <IconTrashXmark aria-hidden />,
      run: () =>
        confirmRemoveFolder({
          id: folder.id,
          name: folder.name,
          onRemoved: async () => {
            await folders.refresh();
            selectLibraryNav({ kind: "all" });
          },
        }),
    },
  );
  return entries;
}

/** Actions for what you're looking at: the open Save or the selection first, then the current folder or Trash. */
export function useContextEntries(
  pathname: string,
  searching: boolean,
): MenuEntry[] {
  const nav = useLibraryNav();
  const { saves, opened } = useFocusedSaves(pathname);
  const onCollection = isSaveCollectionPath(pathname);
  const folderRows = useFolders();
  const includeSubfolders = useIncludeSubfolders();
  const trashCount = useResultTotal();

  return useMemo(() => {
    const entries = saveEntries(saves, opened, searching);
    if (!onCollection) return entries;
    if (nav.kind === "folder") {
      const folder = folderRows.find((row) => row.id === nav.id);
      if (folder)
        entries.push(...folderEntries(folder, folderRows, includeSubfolders));
    } else if (nav.kind === "trash") {
      entries.push(
        ...specEntries(buildTrashMenuItems(trashCount > 0), "Trash", "trash"),
      );
    }
    return entries;
  }, [
    saves,
    opened,
    searching,
    onCollection,
    nav,
    folderRows,
    includeSubfolders,
    trashCount,
  ]);
}
