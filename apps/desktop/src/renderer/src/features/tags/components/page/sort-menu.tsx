import { IconSortArrows } from "@pond/icons";
import type { Prefs } from "@pond/schema";
import { Menu } from "@pond/ui";
import type { MenuItemSpec } from "@pond/ui";
import { SpecMenu } from "@/shared/components/spec-context-menu";

type TagSort = Prefs["allTags"]["sort"];
type TagSortDirection = Prefs["allTags"]["sortDirection"];

const OPTIONS = [
  { label: "Name: A to Z", sort: "name", direction: "asc" },
  { label: "Name: Z to A", sort: "name", direction: "desc" },
  { label: "Most Used", sort: "count", direction: "desc" },
  { label: "Least Used", sort: "count", direction: "asc" },
  { label: "Recently Used", sort: "recent", direction: "desc" },
] as const satisfies ReadonlyArray<{
  label: string;
  sort: TagSort;
  direction: TagSortDirection;
}>;

export function buildTagSortItems({
  sort,
  direction,
  onChange,
}: {
  sort: TagSort;
  direction: TagSortDirection;
  onChange: (sort: TagSort, direction: TagSortDirection) => void;
}): Array<MenuItemSpec> {
  return OPTIONS.map((option) => ({
    type: "checkbox",
    label: option.label,
    indicator: "check",
    checked: option.sort === sort && option.direction === direction,
    onCheckedChange: (checked) => {
      if (checked) {
        onChange(option.sort, option.direction);
      }
    },
  }));
}

export function TagSortMenu({
  sort,
  direction,
  onChange,
}: {
  sort: TagSort;
  direction: TagSortDirection;
  onChange: (sort: TagSort, direction: TagSortDirection) => void;
}) {
  return (
    <SpecMenu
      buildItems={() => buildTagSortItems({ sort, direction, onChange })}
    >
      <Menu.Trigger icon size="sm" variant="ghost" aria-label="Sort Tags">
        <IconSortArrows />
      </Menu.Trigger>
    </SpecMenu>
  );
}
