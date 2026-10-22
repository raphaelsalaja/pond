import type { ComponentType, ReactNode } from "react";
import type { ShortcutId } from "@/shared/lib/shortcuts";
import type { MatchRange } from "./score";

export type CommandIcon = ComponentType<{ "aria-hidden"?: boolean }>;

export interface CommandSpec {
  id: string;
  group: "Create" | "Import" | "Navigate" | "App";
  label: string;
  detail?: string;
  icon: CommandIcon;
  keywords: string;
  shortcut?: ShortcutId;
  run: () => void;
}

export type MenuPage =
  | {
      kind: "actions";
      key: string;
      title: string;
      /** What the title names, shown before it in the breadcrumb. */
      context?: string;
      entries: readonly MenuEntry[];
    }
  | {
      kind: "folders";
      key: string;
      title: string;
      saveIds: readonly string[];
    }
  | { kind: "views"; key: string; title: string };

export interface MenuEntry {
  id: string;
  group: string;
  label: string;
  /** Taller row, for entries with a media preview. */
  tall?: boolean;
  /** What this entry is, for the breadcrumb of its actions page. */
  noun?: string;
  /** Inline after the label. */
  detail?: string;
  keywords?: string;
  icon: ReactNode;
  shortcut?: ShortcutId;
  /** Lowest score while a query is active, for entries matched on text the label doesn't show. */
  scoreFloor?: number;
  /** Multiplies the label score, so near ties go to commands. */
  scoreWeight?: number;
  /** Secondary actions, opened with Tab, Right Arrow, or Command-Return. */
  actions?: () => readonly MenuEntry[];
  /** Opens a page instead of running. */
  page?: () => MenuPage;
  run?: () => void;
}

export interface RankedEntry {
  entry: MenuEntry;
  score: number;
  ranges: readonly MatchRange[];
}

export type MenuRow =
  | { kind: "group"; key: string; label: string; divided: boolean }
  | { kind: "entry"; key: string; index: number; item: RankedEntry }
  | { kind: "status"; key: string; label: string; busy: boolean };

export interface MenuModel {
  rows: readonly MenuRow[];
  /** Selectable entries in display order with the footer last; a row's `index` points here. */
  entries: readonly RankedEntry[];
  footer: RankedEntry | null;
}
