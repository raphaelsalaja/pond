import {
  IconFolder,
  IconFolderTree,
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
import { buildSaveMenu, descendantFolderIds } from "@/features/saves";
import {
  useOpenSaveId,
  useResultTotal,
  useSelectedIds,
} from "@/features/saves/navigation";
import { savesStore } from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";
import { tagClipboard } from "@/features/tags";
import { offerEntries } from "./offer-entries";
import { usePageEntries } from "./page-entries";
import { specEntries } from "./spec-entries";
import type { MenuEntry } from "./types";
import { useOnCollection } from "./use-on-collection";

/** Shown before a query; typing searches every action in the Save menu. */
const SUGGESTED = new Set([
  "Add Tags",
  "Add to Folders",
  "Rename",
  "Rename Saves",
  "Restore from Trash",
  "Move to Trash",
]);

function sameSaves(a: ReadonlyArray<Save>, b: ReadonlyArray<Save>): boolean {
  return a.length === b.length && a.every((save, i) => save === b[i]);
}

function useFocusedSaves() {
  const openId = useOpenSaveId();
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
  saves: ReadonlyArray<Save>,
  opened: boolean,
  searching: boolean,
): Array<MenuEntry> {
  if (saves.length === 0) {
    return [];
  }
  const group = opened ? "Current Save" : `${saves.length} Selected`;
  const items = buildSaveMenu(saves, {
    clipboardEmpty: tagClipboard.get().length === 0,
    opened,
  });
  return offerEntries({
    group,
    key: "focus",
    entries: specEntries(items, group, "focus"),
    suggested: SUGGESTED,
    searching,
  });
}

function folderEntries(
  folder: Folder,
  rows: ReadonlyArray<Folder>,
  includeSubfolders: boolean,
): Array<MenuEntry> {
  const group = "Current Folder";
  const hasChildren = rows.some((row) => row.parentId === folder.id);
  const entries: Array<MenuEntry> = [
    {
      id: "folder:new-subfolder",
      group,
      label: "New Subfolder",
      icon: <IconFolder aria-hidden />,
      run: () => {
        void newFolder(folder.id);
      },
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

/** Actions for what you're looking at: the open Save or the selection first, then the current folder, Trash, or page. */
export function useContextEntries(
  pathname: string,
  searching: boolean,
): Array<MenuEntry> {
  const nav = useLibraryNav();
  const { saves, opened } = useFocusedSaves();
  const onCollection = useOnCollection(pathname);
  const folderRows = useFolders();
  const includeSubfolders = useIncludeSubfolders();
  const trashCount = useResultTotal();
  const pageEntries = usePageEntries(pathname, searching);

  return useMemo(() => {
    const entries = saveEntries(saves, opened, searching);
    entries.push(...pageEntries);
    if (!onCollection || !nav) return entries;
    if (nav.kind === "folder") {
      const folder = folderRows.find((row) => row.id === nav.id);
      if (folder) {
        entries.push(...folderEntries(folder, folderRows, includeSubfolders));
      }
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
    pageEntries,
  ]);
}
