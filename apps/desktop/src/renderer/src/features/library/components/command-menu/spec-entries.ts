import type { MenuItemSpec } from "@pond/ui";
import type { MenuEntry } from "./types";

function glyphs(shortcut: string | string[] | undefined): readonly string[] {
  if (!shortcut) return [];
  return Array.isArray(shortcut) ? shortcut : [shortcut];
}

/** Turns a context menu spec into command entries, so both surfaces offer the same actions; submenus become pages. */
export function specEntries(
  items: readonly MenuItemSpec[],
  group: string,
  key: string,
): MenuEntry[] {
  const entries: MenuEntry[] = [];
  items.forEach((item, index) => {
    if (item.type === "separator" || item.type === "custom" || item.hidden)
      return;
    if (item.type === "group") {
      entries.push(...specEntries(item.items, group, `${key}.${index}`));
      return;
    }
    if (item.disabled || typeof item.label !== "string") return;
    const { label } = item;
    const base = {
      id: `${key}.${index}`,
      group,
      label,
      keywords: item.keywords,
      icon: item.icon ?? null,
    };
    if (item.type === "submenu") {
      const children = specEntries(item.items, "", base.id);
      if (children.length === 0) return;
      entries.push({
        ...base,
        page: () => ({
          kind: "actions",
          key: base.id,
          title: label,
          entries: children,
        }),
      });
      return;
    }
    if (item.type === "checkbox") {
      const { checked, onCheckedChange } = item;
      if (!onCheckedChange) return;
      entries.push({
        ...base,
        keys: glyphs(item.shortcut),
        checked,
        run: () => onCheckedChange(!checked),
      });
      return;
    }
    if (!item.onClick) return;
    entries.push({ ...base, keys: glyphs(item.shortcut), run: item.onClick });
  });
  return entries;
}
