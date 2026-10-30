import {
  IconArrowUpRight,
  IconCompass,
  IconCopy,
  IconMagnifier,
} from "@pond/icons";
import { normalizeListKinds } from "@pond/schema/list-kinds";
import type { MenuItemSpec } from "@pond/ui";
import type { DetailRow } from "@/features/saves/lib/detail";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";
import type { Save } from "@/features/saves/types";
import { openSources } from "@/features/sources";

interface RowAction {
  label: string;
  run: () => void;
}

function copy(value: string): void {
  void navigator.clipboard.writeText(value).catch(() => undefined);
}

function openProfile(row: DetailRow): RowAction | null {
  const href = row.href;
  if (!href) return null;
  return {
    label: "Open Profile",
    run: () => void window.pond.openExternal(href),
  };
}

function openAccount(row: DetailRow): RowAction | null {
  const id = row.accountId;
  if (!id) return null;
  return {
    label: "Open in Sources",
    run: () =>
      openSources(
        row.watch
          ? { type: "inspect-watch", id }
          : { type: "inspect-account", id },
      ),
  };
}

function showMatching(row: DetailRow, save: Save): RowAction | null {
  switch (row.id) {
    case "author":
      return {
        label: `Show Saves by ${row.value}`,
        run: () =>
          saveLibraryBridge.showMatching({
            field: "creator",
            operator: "eq",
            value: row.value,
          }),
      };
    case "from": {
      const id = row.accountId;
      if (!id) return null;
      return {
        label: `Show Saves from ${row.value}`,
        run: () =>
          saveLibraryBridge.showMatching({
            field: "account",
            operator: "eq",
            value: id,
          }),
      };
    }
    case "platform":
      return {
        label: `Show ${row.value} Saves`,
        run: () =>
          saveLibraryBridge.showMatching({
            field: "source",
            operator: "eq",
            value: save.source,
          }),
      };
    case "importedFrom": {
      const origin = save.importedFrom;
      if (!origin) return null;
      return {
        label: `Show Saves Imported from ${row.value}`,
        run: () =>
          saveLibraryBridge.showMatching({
            field: "importedFrom",
            operator: "eq",
            value: origin,
          }),
      };
    }
    case "list": {
      const kinds = normalizeListKinds(save.listKinds);
      if (kinds.length === 0) return null;
      return {
        label: `Show ${row.value} Saves`,
        run: () =>
          saveLibraryBridge.showMatching({
            field: "list",
            operator: "some",
            value: kinds,
          }),
      };
    }
    default:
      return null;
  }
}

/** What a plain click on the tile does. */
export function primaryRowAction(row: DetailRow, save: Save): RowAction | null {
  if (row.kind === "author") return openProfile(row) ?? showMatching(row, save);
  if (row.kind === "account") return openAccount(row);
  return showMatching(row, save);
}

export function buildRowMenu(row: DetailRow, save: Save): MenuItemSpec[] {
  const items: MenuItemSpec[] = [];
  const matching = showMatching(row, save);
  if (matching) {
    items.push({
      label: matching.label,
      icon: <IconMagnifier />,
      onClick: matching.run,
    });
  }
  const profile = row.kind === "author" ? openProfile(row) : null;
  if (profile) {
    items.push({
      label: profile.label,
      icon: <IconArrowUpRight />,
      onClick: profile.run,
    });
  }
  const account = row.kind === "account" ? openAccount(row) : null;
  if (account) {
    items.push({
      label: account.label,
      icon: <IconCompass />,
      onClick: account.run,
    });
  }
  if (items.length > 0) items.push({ type: "separator" });
  items.push({
    label:
      row.kind === "author" || row.kind === "account"
        ? "Copy Name"
        : `Copy ${row.label}`,
    icon: <IconCopy />,
    onClick: () => copy(row.value),
  });
  const href = row.href;
  if (href) {
    items.push({
      label: "Copy Profile Link",
      icon: <IconCopy />,
      onClick: () => copy(href),
    });
  }
  return items;
}
