import type { Prefs } from "@pond/schema";
import type { SavedView } from "@pond/schema/db";

export type EditorRequest =
  | {
      mode: "create";
      kind: "smart_folder" | "group";
      parentId: string | null;
      onSaved?: () => void;
    }
  | { mode: "edit"; view: SavedView };

export type OpenEditor = (request: EditorRequest) => void;

export type SavedViewPresentation = Prefs["savedViewViews"][string];
