import type { Source } from "@pond/schema/db";
import type { ReactNode } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { Save } from "@/pool/types";
import type { PondApi } from "../../../../../preload";

export type CommandGroup =
  | "Navigation"
  | "Settings"
  | "Actions"
  | "Sources"
  | "Tags"
  | "Saves"
  | "Save";

export type CommandScope =
  | "all"
  | "saves"
  | "settings"
  | "actions"
  | "sources"
  | "tags";

export interface PaletteCtx {
  navigate: NavigateFunction;
  close: () => void;
  pond: PondApi;
  selectedIds: string[];
  focusedSaveId: string | null;
  focusedSave: Save | null;
  setTheme: (theme: "system" | "light" | "dark") => void;
  toast: { success(msg: string): void; warn(msg: string): void };
}

export interface Command {
  id: string;
  label: string;
  description?: string;
  group: CommandGroup;
  scope?: CommandScope;
  keywords?: string[];
  icon?: ReactNode;
  shortcut?: string[];
  chord?: string[];
  when?: (ctx: PaletteCtx) => boolean;
  perform: (ctx: PaletteCtx) => void | Promise<void>;
}

export function indexChords(commands: Command[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of commands) {
    if (!c.chord || c.chord.length === 0) continue;
    map.set(c.chord.map((k) => k.toLowerCase()).join(" "), c.id);
  }
  return map;
}

export const SCOPE_LABEL: Record<CommandScope, string> = {
  all: "All",
  saves: "Saves",
  settings: "Settings",
  actions: "Actions",
  sources: "Sources",
  tags: "Tags",
};

export const SCOPE_ORDER: CommandScope[] = [
  "all",
  "saves",
  "settings",
  "actions",
  "sources",
  "tags",
];

export const GROUP_ORDER: CommandGroup[] = [
  "Save",
  "Navigation",
  "Actions",
  "Settings",
  "Sources",
  "Tags",
  "Saves",
];

export type ScopeKey = `${CommandScope}`;

export function defaultSourceLabel(source: Source): string {
  return source.charAt(0).toUpperCase() + source.slice(1);
}
