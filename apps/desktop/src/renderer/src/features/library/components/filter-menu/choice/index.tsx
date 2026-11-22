import { IconFolderBan, IconTagSlash } from "@pond/icons";
import type { IconComponent } from "@pond/icons/types";
import { FIELD_META } from "@pond/schema/filters/meta";
import type { FieldId, Predicate } from "@pond/schema/filters/types";
import { Menu } from "@pond/ui";
import { useState } from "react";
import { fieldIcon } from "@/features/search/query";
import { formatNumber, formatPlural } from "@/shared/lib/format";
import { choiceIsSearchable } from "../layout";
import type { FilterOption } from "../options";
import { isChoiceSelected } from "../selection";
import { emptyChoiceLabel } from "../summary";
import { useChoiceCounts } from "../use-choice-counts";
import { EmptyChoice } from "./empty";
import { ChoiceOption } from "./option";
import styles from "./styles.module.css";

const NOUNS = new Map<FieldId, readonly [string, string]>([
  ["tags", ["tag", "tags"]],
  ["folder", ["folder", "folders"]],
  ["list", ["list", "lists"]],
  ["format", ["format", "formats"]],
  ["source", ["source", "sources"]],
  ["creator", ["creator", "creators"]],
  ["account", ["account", "accounts"]],
]);

const EMPTY_ICONS = new Map<FieldId, IconComponent>([
  ["tags", IconTagSlash],
  ["folder", IconFolderBan],
]);

/** Preset values read in a deliberate order; values that come from saves sort by name. */
const PRESET_ORDER = new Set<FieldId>([
  "type",
  "shape",
  "aspect",
  "sensitiveContent",
]);

/** Short lists show every option; longer ones fold zero-count options behind one row. */
const COLLAPSE_MIN = 10;

function optionValue(option: FilterOption): string {
  const raw = Array.isArray(option.predicate.value)
    ? option.predicate.value[0]
    : option.predicate.value;
  return String(raw).toLowerCase();
}

function sortKey(option: FilterOption): string {
  return option.crumb ? `${option.crumb} ${option.label}` : option.label;
}

export function ChoiceFilter({
  field,
  options,
  matching = "any",
  rows,
  search,
  onChange,
}: {
  field: FieldId;
  options: FilterOption[];
  matching?: "any" | "all";
  rows: Predicate[];
  search: string;
  onChange: (rows: Predicate[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = FIELD_META[field];
  const { counts, empty } = useChoiceCounts(field);
  const needle = search.trim().toLowerCase();
  const FieldIcon = fieldIcon(field);
  const EmptyIcon = EMPTY_ICONS.get(field) ?? FieldIcon;
  const emptyLabel = emptyChoiceLabel(field);
  const showEmpty =
    meta.type === "stringArray" && emptyLabel.toLowerCase().includes(needle);
  const allOptions = [...options];
  if (field === "format") {
    for (const value of counts.keys()) {
      allOptions.push({
        label: value.toUpperCase(),
        predicate: { field, operator: "some", value: [value] },
      });
    }
  }
  for (const row of rows.filter(
    (row) =>
      row.field === field &&
      ["eq", "neq", "in", "nin", "some", "every", "none"].includes(
        row.operator,
      ),
  )) {
    for (const value of Array.isArray(row.value) ? row.value : [row.value]) {
      if (
        allOptions.some((option) =>
          isChoiceSelected(
            [{ field, operator: "eq", value }],
            option.predicate,
            "any",
          ),
        )
      )
        continue;
      allOptions.push({
        label: String(value),
        predicate: {
          field,
          operator: meta.type === "stringArray" ? "some" : "eq",
          value: meta.type === "stringArray" ? [value] : value,
        },
      });
    }
  }
  const countOf = (option: FilterOption) =>
    counts.get(optionValue(option)) ?? 0;
  const selected = (option: FilterOption) =>
    isChoiceSelected(rows, option.predicate, "any") ||
    isChoiceSelected(rows, option.predicate, "exclude");
  const matches = allOptions.filter(
    (option) =>
      option.label.toLowerCase().includes(needle) ||
      option.crumb?.toLowerCase().includes(needle),
  );
  if (!PRESET_ORDER.has(field))
    matches.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const unused = matches.filter(
    (option) => countOf(option) === 0 && !selected(option),
  );
  const collapsed =
    !needle &&
    !expanded &&
    allOptions.length >= COLLAPSE_MIN &&
    unused.length > 0;
  const shown = collapsed
    ? matches.filter((option) => !unused.includes(option))
    : matches;
  const [one, many] = NOUNS.get(field) ?? ["option", "options"];

  return (
    <>
      {choiceIsSearchable(field, options.length) ? (
        <Menu.Input aria-label={`Filter ${meta.label}`} placeholder="Search…" />
      ) : null}
      <Menu.FilterList className={styles.list}>
        {showEmpty ? (
          <EmptyChoice
            field={field}
            label={emptyLabel}
            count={empty ? formatNumber(empty) : null}
            icon={<EmptyIcon />}
            rows={rows}
            onChange={onChange}
          />
        ) : null}
        {shown.map((option) => {
          const count = countOf(option);
          return (
            <ChoiceOption
              key={optionValue(option)}
              option={option}
              rows={rows}
              matching={matching}
              count={count ? formatNumber(count) : null}
              icon={option.icon ?? <FieldIcon />}
              onChange={onChange}
            />
          );
        })}
        {collapsed ? (
          <>
            <Menu.Separator />
            <Menu.Item closeOnClick={false} onClick={() => setExpanded(true)}>
              <Menu.ItemIcon>
                <FieldIcon />
              </Menu.ItemIcon>
              <Menu.ItemLabel>
                {`${formatPlural(unused.length, { one, other: many })} with no matching Saves`}
              </Menu.ItemLabel>
            </Menu.Item>
          </>
        ) : null}
        {!shown.length && !showEmpty ? (
          <Menu.Item disabled>
            <Menu.ItemLabel>
              {needle ? "No matches" : "None available"}
            </Menu.ItemLabel>
          </Menu.Item>
        ) : null}
      </Menu.FilterList>
    </>
  );
}
