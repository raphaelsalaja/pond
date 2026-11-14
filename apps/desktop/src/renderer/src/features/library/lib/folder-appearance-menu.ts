import type { MenuItemSpec } from "@pond/ui";
import { createElement } from "react";
import {
  folderAppearanceRecents,
  rememberFolderColor,
  rememberFolderIcon,
} from "@/features/library/state/folder-appearance";
import { saveFolderPresentation } from "@/features/library/state/folder-presentation";
import { folders } from "@/features/library/state/folders";
import {
  FOLDER_ICONS,
  FOLDER_MENU_ICONS,
  FOLDER_SWATCHES,
  type FolderIconId,
  type FolderIconOption,
} from "@/shared/lib/folder-icons";
import { notify } from "@/shared/lib/toast";

const ICONS_BY_ID = new Map(FOLDER_ICONS.map((option) => [option.id, option]));

interface FolderColorMenuInput {
  folder: { id: string; color: string | null };
  /** Sidebar menus draw a glyph per row; compact menus list labels only. */
  glyphs: boolean;
}

interface FolderIconMenuInput {
  folderId: string;
  icon: FolderIconId | undefined;
  glyphs: boolean;
}

function swatchGlyph(css: string) {
  return createElement("span", {
    "aria-hidden": true,
    style: {
      width: 14,
      height: 14,
      border: "1px solid currentColor",
      borderRadius: "50%",
      background: css,
    },
  });
}

/** Recent picks plus the current value, minus whatever the fixed list already shows. */
function extras<T>(
  recent: readonly T[],
  current: T | null,
  shown: readonly T[],
): T[] {
  const candidates = current === null ? recent : [...recent, current];
  return [...new Set(candidates)].filter((value) => !shown.includes(value));
}

function recentGroup(items: MenuItemSpec[]): MenuItemSpec[] {
  return items.length
    ? [{ type: "separator" }, { type: "group", label: "Recently Used", items }]
    : [];
}

export function folderIconMenuItems({
  folderId,
  icon,
  glyphs,
}: FolderIconMenuInput): MenuItemSpec[] {
  const current = icon ?? "folder";
  const item = (option: FolderIconOption): MenuItemSpec => ({
    type: "checkbox",
    label: option.label,
    icon: glyphs ? createElement(option.Icon) : undefined,
    checked: current === option.id,
    onCheckedChange: () => {
      void saveFolderPresentation(folderId, { icon: option.id });
      void rememberFolderIcon(option.id);
    },
  });
  const shown = FOLDER_MENU_ICONS.map((option) => option.id);
  const recent = extras(folderAppearanceRecents().recentIcons, current, shown);
  const more = recent.flatMap((id) => ICONS_BY_ID.get(id) ?? []);
  return [...FOLDER_MENU_ICONS.map(item), ...recentGroup(more.map(item))];
}

function setColor(folderId: string, color: string | null): void {
  void window.pond
    .query("folders.setColor", { id: folderId, color })
    .then((result) => {
      if (!result.ok) throw new Error(result.error);
      void rememberFolderColor(color);
      return folders.refresh();
    })
    .catch(() =>
      notify({ id: "folder-color", title: "Couldn't update folder color" }),
    );
}

export function folderColorMenuItems({
  folder,
  glyphs,
}: FolderColorMenuInput): MenuItemSpec[] {
  const item = (
    color: string | null,
    label: string,
    css: string,
  ): MenuItemSpec => ({
    type: "checkbox",
    label,
    icon: glyphs ? swatchGlyph(css) : undefined,
    checked: folder.color === color,
    onCheckedChange: () => setColor(folder.id, color),
  });
  const custom = folder.color?.startsWith("#") ? folder.color : null;
  const named = FOLDER_SWATCHES.flatMap((option) => option.id ?? []);
  const recent = extras(folderAppearanceRecents().recentColors, custom, named);
  return [
    ...FOLDER_SWATCHES.map((option) =>
      item(option.id, option.label, option.css),
    ),
    ...recentGroup(recent.map((hex) => item(hex, hex.toUpperCase(), hex))),
  ];
}
