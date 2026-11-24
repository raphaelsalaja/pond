import { pickCardUnit } from "@/features/saves/lib/media/units";
import type { Save } from "@/features/saves/types";
import type { LibraryNav } from "@/shared/lib/library-nav";

export type SaveListMode =
  | "library"
  | "untagged"
  | "recentlyAdded"
  | "recents"
  | "trash";

export function modeForNav(nav: LibraryNav | null): SaveListMode {
  switch (nav?.kind) {
    case "untagged":
    case "recentlyAdded":
    case "recents":
    case "trash":
      return nav.kind;
    default:
      return "library";
  }
}

interface ModeFilterOptions {
  mode: SaveListMode;
  sourceFilter: string;
  recentsOrder: ReadonlyMap<string, number> | null;
}

function isRenderable(save: Save): boolean {
  if (pickCardUnit(save)) {
    return true;
  }
  if (save.mediaType === "link" || save.mediaType === "text") {
    return true;
  }
  if (save.url && !save.url.startsWith("pond:")) {
    return true;
  }
  return false;
}

export function applyModeFilter(
  saves: ReadonlyArray<Save>,
  { mode, sourceFilter, recentsOrder }: ModeFilterOptions,
): Array<Save> {
  return saves.filter((save) => {
    if (mode === "trash") {
      if (!save.deletedAt) {
        return false;
      }
    } else {
      if (save.deletedAt) {
        return false;
      }
      if (!isVisibleInLibrary(save)) {
        return false;
      }
      if (!isRenderable(save)) {
        return false;
      }
    }
    if (sourceFilter && save.source.toLowerCase() !== sourceFilter) {
      return false;
    }
    if (mode === "untagged" && save.tags.length > 0) {
      return false;
    }
    if (mode === "recents" && !recentsOrder?.has(save.id)) {
      return false;
    }
    return true;
  });
}

function isVisibleInLibrary(save: Save): boolean {
  if (save.status === "complete") {
    return true;
  }
  if (save.status !== "ingesting") {
    return false;
  }
  if ((save.files?.length ?? 0) > 0) {
    return true;
  }
  return save.mediaType === "link" || save.mediaType === "text";
}
