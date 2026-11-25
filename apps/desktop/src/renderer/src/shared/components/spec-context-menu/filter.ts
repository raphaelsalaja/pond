import { Menu } from "@pond/ui";
import type { MenuItemSpec } from "@pond/ui";
import { Children, isValidElement } from "react";
import type { ReactNode } from "react";

const { contains } = Menu.getFilter();

function labelText(label: ReactNode): string {
  const labels = Children.toArray(label);
  const value = labels.length === 1 ? labels[0] : null;
  return value !== null && value !== undefined && !isValidElement(value)
    ? String(value)
    : "";
}

function keywordsOf(item: MenuItemSpec): string {
  return "keywords" in item ? (item.keywords ?? "") : "";
}

function textOf(item: MenuItemSpec): string {
  const label = "label" in item ? labelText(item.label) : "";
  return `${label} ${keywordsOf(item)}`;
}

function isHidden(item: MenuItemSpec): boolean {
  return "hidden" in item && Boolean(item.hidden);
}

function isDisabled(item: MenuItemSpec): boolean {
  return "disabled" in item && Boolean(item.disabled);
}

function matchesAll(text: string, terms: Array<string>): boolean {
  return terms.every((term) => contains(text, term));
}

function matchesCustom(terms: Array<string>): boolean {
  return terms.some((term) => /color|icon|swatch/i.test(term));
}

function withBreadcrumb(
  item: MenuItemSpec,
  breadcrumb: Array<ReactNode>,
): MenuItemSpec {
  if (
    breadcrumb.length === 0 ||
    item.type === "separator" ||
    item.type === "custom" ||
    item.type === "group" ||
    item.type === "submenu" ||
    item.type === "radio"
  ) {
    return item;
  }
  return { ...item, breadcrumb };
}

function collectLeaves(
  items: Array<MenuItemSpec>,
  terms: Array<string>,
  path: string,
  breadcrumb: Array<ReactNode>,
): Array<MenuItemSpec> {
  const out: Array<MenuItemSpec> = [];
  for (const item of items) {
    if (item.type === "separator" || isHidden(item) || isDisabled(item)) {
      continue;
    }
    if (item.type === "submenu" || item.type === "group") {
      out.push(
        ...collectLeaves(item.items, terms, `${path} ${textOf(item)}`, [
          ...breadcrumb,
          item.label,
        ]),
      );
      continue;
    }
    if (item.type === "custom") {
      if (matchesCustom(terms)) out.push(item);
      continue;
    }
    if (item.type === "radio") {
      const options = item.options
        .filter(
          (option) =>
            !option.disabled &&
            matchesAll(
              `${path} ${labelText(option.label)} ${option.keywords ?? ""}`,
              terms,
            ),
        )
        .map((option) =>
          breadcrumb.length > 0 ? { ...option, breadcrumb } : option,
        );
      if (options.length > 0) out.push({ ...item, options });
      continue;
    }
    if (matchesAll(`${path} ${textOf(item)}`, terms)) {
      out.push(withBreadcrumb(item, breadcrumb));
    }
  }
  return out;
}

export function filterMenuItems(
  items: Array<MenuItemSpec>,
  query: string,
): Array<MenuItemSpec> {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return items;
  return collectLeaves(items, terms, "", []);
}
