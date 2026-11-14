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
import { parseMode, useRecents } from "@/features/saves";
import {
  isSaveCollectionPath,
  listPathForLocation,
} from "@/features/saves/lib/list-path";
import { applyNavFilter } from "@/features/saves/lib/nav-filter";
import type { Save } from "@/features/saves/types";

export interface ViewScope {
  name: string;
  /** The Saves from this list that the current view shows. */
  pick: (saves: readonly Save[]) => Save[];
}

/** The narrowed Library view you're on, if any, so its Saves can rank ahead of the rest. */
export function useViewScope(pathname: string): ViewScope | null {
  const nav = useLibraryNav();
  const folderRows = useFolders();
  const memberships = useFolderMemberships();
  const includeSubfolders = useIncludeSubfolders();
  const recents = useRecents();

  return useMemo(() => {
    if (!isSaveCollectionPath(pathname)) return null;
    const mode = parseMode(listPathForLocation(pathname)) ?? "library";
    const view = searchViewFor(mode, nav);
    if (view.kind === "library" || view.kind === "trash") return null;
    const name = searchViewName(view, folderRows);
    switch (view.kind) {
      case "untagged":
        return {
          name,
          pick: (saves) => saves.filter((save) => save.tags.length === 0),
        };
      case "recentlyAdded": {
        const since = recentlyAddedSince();
        return {
          name,
          pick: (saves) => saves.filter((save) => save.createdAt >= since),
        };
      }
      case "recents": {
        const ids = new Set(recents.map((entry) => entry.saveId));
        return { name, pick: (saves) => saves.filter((s) => ids.has(s.id)) };
      }
      default:
        return {
          name,
          pick: (saves) =>
            applyNavFilter(
              saves,
              nav,
              memberships,
              folderRows,
              includeSubfolders,
            ),
        };
    }
  }, [pathname, nav, folderRows, memberships, includeSubfolders, recents]);
}
