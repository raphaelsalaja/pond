import { Menu, type MenuItemSpec } from "@pond/ui";
import { Children, isValidElement, type ReactNode } from "react";

const { contains } = Menu.getFilter();

function labelText(label: ReactNode): string {
  const labels = Children.toArray(label);
  const value = labels.length === 1 ? labels[0] : null;
  return value != null && !isValidElement(value) ? String(value) : "";
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

function matchesAll(text: string, terms: string[]): boolean {
  return terms.every((term) => contains(text, term));
}

function matchesCustom(terms: string[]): boolean {
  return terms.some((term) => /color|icon|swatch/i.test(term));
}

function withBreadcrumb(
  item: MenuItemSpec,
  breadcrumb: ReactNode[],
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
  items: MenuItemSpec[],
  terms: string[],
  path: string,
  breadcrumb: ReactNode[],
): MenuItemSpec[] {
  const out: MenuItemSpec[] = [];
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
  items: MenuItemSpec[],
  query: string,
): MenuItemSpec[] {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return items;
  return collectLeaves(items, terms, "", []);
}
