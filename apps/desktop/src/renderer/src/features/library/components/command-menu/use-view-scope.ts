import type { LibraryQueryRequest } from "@shared/library-query";
import { recentlyAddedSince } from "@shared/recently-added";
import { useMemo } from "react";
import {
  searchViewFor,
  searchViewName,
} from "@/features/library/lib/search-view";
import {
  useFolderMemberships,
  useFolders,
} from "@/features/library/state/folders";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import { useIncludeSubfolders } from "@/features/library/state/view-store";
import {
  applyNavFilter,
  descendantFolderIds,
  useRecents,
} from "@/features/saves";
import type { Save } from "@/features/saves/types";
import { useOnCollection } from "./use-on-collection";

export interface ViewScope {
  name: string;
  /** Trash holds deleted Saves, which the Library lookup never returns. */
  deleted: boolean;
  /** The same scope the Library grid queries, so the menu can search inside the view. */
  request: NonNullable<LibraryQueryRequest["scope"]>;
  /** The Saves from this list that the current view shows. */
  pick: (saves: ReadonlyArray<Save>) => Array<Save>;
}

/** The narrowed Library view you're on, if any, so its Saves can rank ahead of the rest. */
export function useViewScope(pathname: string): ViewScope | null {
  const nav = useLibraryNav();
  const folderRows = useFolders();
  const memberships = useFolderMemberships();
  const includeSubfolders = useIncludeSubfolders();
  const recents = useRecents();
  const onCollection = useOnCollection(pathname);

  return useMemo(() => {
    if (!onCollection || !nav) {
      return null;
    }
    const view = searchViewFor(nav);
    if (view.kind === "library") {
      return null;
    }
    const name = searchViewName(view, folderRows);
    const base = { name, deleted: false };
    const navPick = (saves: ReadonlyArray<Save>) =>
      applyNavFilter(saves, nav, memberships, folderRows, includeSubfolders);
    switch (view.kind) {
      case "trash":
        return {
          ...base,
          deleted: true,
          request: { deletedOnly: true },
          pick: (saves) => saves.filter((save) => Boolean(save.deletedAt)),
        };
      case "untagged":
        return {
          ...base,
          request: { untagged: true },
          pick: (saves) => saves.filter((save) => save.tags.length === 0),
        };
      case "recentlyAdded": {
        const since = recentlyAddedSince();
        return {
          ...base,
          request: { savedSince: since },
          pick: (saves) => saves.filter((save) => save.createdAt >= since),
        };
      }
      case "recents": {
        const ids = recents.map((entry) => entry.saveId);
        const recent = new Set(ids);
        return {
          ...base,
          request: { saveIds: ids },
          pick: (saves) => saves.filter((save) => recent.has(save.id)),
        };
      }
      case "folder":
        return {
          ...base,
          request: {
            folderIds: includeSubfolders
              ? [...descendantFolderIds(view.id, folderRows)]
              : [view.id],
          },
          pick: navPick,
        };
      case "tag":
        return { ...base, request: { tag: view.name }, pick: navPick };
      case "uncategorized":
        return { ...base, request: { uncategorized: true }, pick: navPick };
    }
  }, [onCollection, nav, folderRows, memberships, includeSubfolders, recents]);
}
