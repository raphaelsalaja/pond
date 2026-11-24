import { readColorMatch } from "@pond/schema/filters/color";
import { FIELD_META } from "@pond/schema/filters/meta";
import { isPredicateList } from "@pond/schema/filters/types";
import type { FieldId, Predicate } from "@pond/schema/filters/types";
import { Chip } from "@pond/ui";
import { useState } from "react";
import type { ReactNode } from "react";
import { FIELD_ICONS } from "@/features/search/query";
import { useMenuFilterQuery } from "@/shared/hooks/use-menu-filter-query";
import { FilterChip, FilterIcons, FilterPopup } from "../chip";
import { ChoiceFilter } from "../choice";
import { ColorFilter } from "../color";
import { ContentFilter } from "../content";
import { editorIsSearchable, filterLayout } from "../layout";
import type { FilterOption } from "../options";
import { CustomFilter } from "../range";
import type { RangeUnit } from "../range";
import { DimensionsFilter } from "../range/dimensions";
import {
  isFilterSelected,
  selectedChoiceMode,
  selectFilter,
} from "../selection";
import { filterSummary } from "../summary";

export function FilterCategory({
  field,
  options,
  rows,
  onChange,
}: {
  field: FieldId;
  options: Array<FilterOption>;
  rows: Array<Predicate>;
  onChange: (rows: Array<Predicate>) => void;
}) {
  const meta = FIELD_META[field];
  const Icon = FIELD_ICONS[field];
  const categoryFields = new Set<FieldId>(
    field === "width" ? ["width", "height"] : [field],
  );
  const activeRules = rows.filter((row) => categoryFields.has(row.field));
  const active = activeRules.length > 0;
  const selectedColor =
    field === "color"
      ? (readColorMatch(activeRules[0]?.value)?.hex ?? undefined)
      : undefined;
  const summary =
    field === "width"
      ? activeRules
          .map(
            (row) =>
              `${row.field === "width" ? "Width" : "Height"} ${filterSummary([row], [])}`,
          )
          .join(" · ")
      : filterSummary(activeRules, options);
  const label = active
    ? summary.startsWith(`${meta.label}: `)
      ? summary
      : `${meta.label}: ${summary}`
    : meta.label;
  const layout = filterLayout(field, options.length);
  const matching = selectedChoiceMode(rows, field);
  const [editorVersion, setEditorVersion] = useState(0);
  const { query, onValueChange, reset } = useMenuFilterQuery();
  const searchable = editorIsSearchable(field, options.length);
  const clear = () => {
    setEditorVersion((version) => version + 1);
    onChange(rows.filter((row) => !categoryFields.has(row.field)));
  };
  const icons = selectedOptionIcons(activeRules, options);
  return (
    <FilterChip
      icon={
        field === "color" ? (
          <Chip.Swatch color={selectedColor} />
        ) : TILE_FIELDS.has(field) && icons.length > 0 ? (
          <FilterIcons icons={icons} />
        ) : icons.length === 1 ? (
          icons[0]?.icon
        ) : (
          <Icon />
        )
      }
      label={summary || meta.label}
      title={label}
      active={active}
      ariaLabel={label}
      onClear={active ? clear : undefined}
      clearLabel={`Clear ${meta.label} Filter`}
      search={
        searchable
          ? { filter: null, value: query, onValueChange, autoHighlight: true }
          : undefined
      }
      onOpen={reset}
    >
      <FilterPopup layout={layout} aria-label={`${meta.label} Filter`}>
        <FilterEditor
          key={editorVersion}
          field={field}
          options={options}
          matching={matching}
          rows={rows}
          search={query}
          onChange={onChange}
        />
      </FilterPopup>
    </FilterChip>
  );
}

const MAX_CHIP_ICONS = 3;

/** Brand tiles are solid, so several can overlap; outline glyphs show only when one value is picked. */
const TILE_FIELDS = new Set<FieldId>(["source", "account"]);

function selectedOptionIcons(
  rules: ReadonlyArray<Predicate>,
  options: ReadonlyArray<FilterOption>,
): Array<{ key: string; icon: ReactNode }> {
  const [rule] = rules;
  if (rules.length !== 1 || !rule || rule.negate) {
    return [];
  }
  if (!["eq", "in", "some", "every"].includes(rule.operator)) {
    return [];
  }
  const values = isPredicateList(rule.value) ? rule.value : [rule.value];
  const entries = values.map((value) => ({
    key: String(value),
    icon: options.find((option) =>
      isFilterSelected([{ ...rule, operator: "eq", value }], option.predicate),
    )?.icon,
  }));
  if (!entries.every((entry) => Boolean(entry.icon))) {
    return [];
  }
  return entries.slice(0, MAX_CHIP_ICONS);
}

export function FilterEditor({
  field,
  options,
  matching = "any",
  rows,
  search,
  onChange,
}: {
  field: FieldId;
  options: Array<FilterOption>;
  matching?: "any" | "all";
  rows: Array<Predicate>;
  search: string;
  onChange: (rows: Array<Predicate>) => void;
}) {
  const type = FIELD_META[field].type;
  const current = rows.find((row) => row.field === field);
  const [rangeUnit, setRangeUnit] = useState<RangeUnit>(
    field === "fileSize" ? "kilobytes" : "seconds",
  );
  const apply = (predicate: Predicate) =>
    onChange(selectFilter(rows, predicate, true));
  const clearField = () => onChange(rows.filter((row) => row.field !== field));
  if (field === "width") {
    return <DimensionsFilter rows={rows} onChange={onChange} />;
  }
  if (type === "enum" || type === "stringArray") {
    return (
      <ChoiceFilter
        field={field}
        options={options}
        matching={matching}
        rows={rows}
        search={search}
        onChange={onChange}
      />
    );
  }
  if (type === "optional" || type === "string") {
    return (
      <ContentFilter
        field={field}
        rows={rows}
        search={search}
        onChange={onChange}
      />
    );
  }
  if (type === "color") {
    return (
      <ColorFilter current={current} onApply={apply} onClear={clearField} />
    );
  }
  if (type === "number" || type === "date") {
    return (
      <CustomFilter
        field={field}
        current={current}
        initialUnit={rangeUnit}
        onUnitChange={setRangeUnit}
        onApply={apply}
        onClear={clearField}
      />
    );
  }
  return null;
}
