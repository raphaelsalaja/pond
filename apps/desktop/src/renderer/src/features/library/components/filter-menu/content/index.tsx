import { IconMagnifier } from "@pond/icons";
import { FIELD_META } from "@pond/schema/filters/meta";
import type { FieldId, Predicate } from "@pond/schema/filters/types";
import { Menu } from "@pond/ui";
import { fieldIcon } from "@/features/search/query";

export function ContentFilter({
  field,
  rows,
  search,
  onChange,
}: {
  field: FieldId;
  rows: Predicate[];
  search: string;
  onChange: (rows: Predicate[]) => void;
}) {
  const label = FIELD_META[field].label;
  const Icon = fieldIcon(field);
  const rules = rows.filter((row) => row.field === field);
  const contains = rules.find((row) => row.operator === "contains")?.value;
  const phrase = contains == null ? null : String(contains);
  const draft = search.trim();
  const apply = (rule?: Predicate) =>
    onChange([
      ...rows.filter((row) => row.field !== field),
      ...(rule ? [rule] : []),
    ]);
  return (
    <>
      <Menu.Input aria-label={`Search ${label}`} placeholder="Search…" />
      <Menu.FilterList>
        {draft && draft !== phrase ? (
          <Menu.Item
            closeOnClick={false}
            onClick={() => apply({ field, operator: "contains", value: draft })}
          >
            <Menu.ItemIcon>
              <IconMagnifier />
            </Menu.ItemIcon>
            <Menu.ItemLabel
              title={draft}
            >{`Contains “${draft}”`}</Menu.ItemLabel>
          </Menu.Item>
        ) : null}
        {phrase ? (
          <Menu.CheckboxItem
            closeOnClick={false}
            checked
            onCheckedChange={() => apply()}
          >
            <Menu.CheckboxItemIndicator reveal="active" />
            <Menu.ItemIcon>
              <IconMagnifier />
            </Menu.ItemIcon>
            <Menu.ItemLabel
              title={phrase}
            >{`Contains “${phrase}”`}</Menu.ItemLabel>
          </Menu.CheckboxItem>
        ) : null}
        {[true, false].map((value) => (
          <Menu.CheckboxItem
            key={String(value)}
            closeOnClick={false}
            checked={rules.some(
              (row) =>
                row.operator === "exists" && row.value === value && !row.negate,
            )}
            onCheckedChange={(checked) =>
              apply(checked ? { field, operator: "exists", value } : undefined)
            }
          >
            <Menu.CheckboxItemIndicator reveal="active" />
            <Menu.ItemIcon>
              <Icon />
            </Menu.ItemIcon>
            <Menu.ItemLabel>
              {value ? `With ${label}` : `Without ${label}`}
            </Menu.ItemLabel>
          </Menu.CheckboxItem>
        ))}
      </Menu.FilterList>
    </>
  );
}
