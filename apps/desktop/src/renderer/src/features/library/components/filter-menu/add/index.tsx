import { IconBarsFilter, IconImageSparkle, IconTextToImage } from "@pond/icons";
import type { IconComponent } from "@pond/icons/types";
import { FIELD_META } from "@pond/schema/filters/meta";
import type { FieldId, Predicate } from "@pond/schema/filters/types";
import { Menu, Tooltip } from "@pond/ui";
import { Fragment, type ReactNode, useState } from "react";
import { libraryHeader } from "@/features/library/state/library-header";
import { fieldIcon } from "@/features/search/query";
import { useMenuFilterQuery } from "@/shared/hooks/use-menu-filter-query";
import { FilterEditor } from "../category";
import { FilterPopup } from "../chip";
import { editorIsSearchable, filterLayout } from "../layout";
import {
  entryFields,
  FILTER_MENU,
  type FilterMenuEntry,
  type FilterMenuGroup,
  type FilterOption,
  isFieldEntry,
  presetOptions,
} from "../options";
import { SemanticPanel, VisualPanel } from "../overlay";
import {
  isChoiceSelected,
  isFilterSelected,
  selectChoice,
  selectedChoiceMode,
  selectFilter,
} from "../selection";
import type { FilterChipId, OverlayId } from "../toolbar-state";
import { useFieldCounts } from "../use-choice-counts";
import { usePresentFields } from "../use-present-fields";
import styles from "./styles.module.css";

const OVERLAYS = [
  { id: "visual", label: "Visual Match", icon: IconImageSparkle },
  { id: "semantic", label: "Semantic", icon: IconTextToImage },
] as const satisfies readonly {
  id: OverlayId;
  label: string;
  icon: IconComponent;
}[];

/** Below this, typed text only narrows field names; values join at two characters. */
const VALUE_SEARCH_MIN = 2;
const VALUES_PER_FIELD = 5;

interface AddFilterProps {
  choices: Partial<Record<FieldId, FilterOption[]>>;
  rows: Predicate[];
  onChange: (rows: Predicate[]) => void;
  applied: readonly FilterChipId[];
}

export function AddFilter({
  choices,
  rows,
  onChange,
  applied,
}: AddFilterProps) {
  const { query: search, onValueChange, reset } = useMenuFilterQuery();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<readonly FilterChipId[]>(applied);
  const present = usePresentFields(open);
  const needle = search.trim().toLowerCase();
  const optionsFor = (field: FieldId) => choices[field] ?? presetOptions(field);
  const matchesName = (label: string) =>
    !needle || matchesInOrder(label, needle);
  const hasData = (field: FieldId) => present?.has(field) ?? true;
  const applies = (field: FieldId) => !hidden.includes(field) && hasData(field);
  const overlays = OVERLAYS.filter(
    (overlay) => !hidden.includes(overlay.id) && matchesName(overlay.label),
  );
  const fieldProps = { rows, onChange };
  const fieldItem = (field: FieldId, crumb?: string) => (
    <FieldSubmenu
      key={field}
      field={field}
      crumb={crumb}
      options={optionsFor(field)}
      {...fieldProps}
    />
  );
  const entryItems = (entry: FilterMenuEntry): ReactNode[] => {
    if (isFieldEntry(entry)) {
      return applies(entry) && matchesName(FIELD_META[entry].label)
        ? [fieldItem(entry)]
        : [];
    }
    const fields = entry.fields.filter(applies);
    if (needle) {
      const matched = matchesName(entry.label)
        ? fields
        : fields.filter((field) => matchesName(FIELD_META[field].label));
      return matched.map((field) => fieldItem(field, entry.label));
    }
    if (fields.length < 2) return fields.map((field) => fieldItem(field));
    return [
      <GroupSubmenu
        key={entry.label}
        group={entry}
        fields={fields}
        optionsFor={optionsFor}
        {...fieldProps}
      />,
    ];
  };
  const sections = FILTER_MENU.map((section) => ({
    key: entryKey(section[0]),
    items: section.flatMap(entryItems),
  })).filter((section) => section.items.length > 0);
  const searchedFields: FieldId[] =
    needle.length < VALUE_SEARCH_MIN
      ? []
      : FILTER_MENU.flat().flatMap(entryFields).filter(hasData);
  const fieldCounts = useFieldCounts(searchedFields.filter(isChoiceField));
  const values = searchedFields
    .map((field) => {
      const counts = fieldCounts.get(field)?.counts;
      const countOf = (option: FilterOption) =>
        counts?.get(optionValue(option)) ?? 0;
      return {
        field,
        options: optionsFor(field)
          .filter(
            (option) =>
              matchesWordStart(option.label, needle) &&
              (!counts || countOf(option) > 0),
          )
          .sort((a, b) => countOf(b) - countOf(a))
          .slice(0, VALUES_PER_FIELD)
          .map((option) => ({
            option,
            count: counts ? countOf(option) : undefined,
          })),
      };
    })
    .filter((group) => group.options.length > 0);
  const groups: { key: string; items: ReactNode }[] = [
    ...(overlays.length
      ? [
          {
            key: "similarity",
            items: overlays.map((overlay) => (
              <OverlaySubmenu key={overlay.id} overlay={overlay} />
            )),
          },
        ]
      : []),
    ...sections,
    ...(values.length
      ? [
          {
            key: "values",
            items: values.map(({ field, options }) => (
              <FieldValues
                key={field}
                field={field}
                options={options}
                rows={rows}
                onChange={onChange}
              />
            )),
          },
        ]
      : []),
  ];

  return (
    <Menu.FilterProvider
      filter={null}
      value={search}
      onValueChange={onValueChange}
    >
      <Menu.Root
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) return;
          libraryHeader.closePopover();
          setHidden(applied);
          reset();
        }}
      >
        <Tooltip label="Add Filter" side="bottom">
          <Menu.Trigger icon size="sm" variant="ghost" aria-label="Add Filter">
            <IconBarsFilter />
          </Menu.Trigger>
        </Tooltip>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={8}>
            <FilterPopup className={styles.popup}>
              <Menu.Input aria-label="Add Filter" placeholder="Search…" />
              <Menu.FilterList className={styles.content}>
                {groups.map((group, index) => (
                  <Fragment key={group.key}>
                    {index > 0 ? <Menu.Separator /> : null}
                    <Menu.Group>{group.items}</Menu.Group>
                  </Fragment>
                ))}
                {groups.length === 0 ? (
                  <Menu.Item disabled>
                    <Menu.ItemLabel>No matches</Menu.ItemLabel>
                  </Menu.Item>
                ) : null}
              </Menu.FilterList>
            </FilterPopup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </Menu.FilterProvider>
  );
}

function entryKey(entry: FilterMenuEntry | undefined): string {
  if (entry === undefined) return "empty";
  return isFieldEntry(entry) ? entry : entry.label;
}

function Submenu({
  icon: Icon,
  label,
  crumb,
  popup,
}: {
  icon: IconComponent;
  label: string;
  crumb?: string;
  popup: ReactNode;
}) {
  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger>
        <Menu.ItemIcon>
          <Icon />
        </Menu.ItemIcon>
        <Menu.ItemLabel>
          {crumb ? (
            <>
              <span data-menu-breadcrumb="">{crumb}</span>
              <span aria-hidden data-menu-breadcrumb-separator="">
                ›
              </span>
              <span data-menu-breadcrumb-current="">{label}</span>
            </>
          ) : (
            label
          )}
        </Menu.ItemLabel>
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner
          side="inline-end"
          align="start"
          sideOffset={4}
          alignOffset={-4}
        >
          {popup}
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );
}

function OverlaySubmenu({ overlay }: { overlay: (typeof OVERLAYS)[number] }) {
  const { query, onValueChange } = useMenuFilterQuery();
  const submenu = (
    <Submenu
      icon={overlay.icon}
      label={overlay.label}
      popup={
        <FilterPopup layout="content" aria-label={`${overlay.label} Filter`}>
          {overlay.id === "semantic" ? (
            <SemanticPanel search={query} />
          ) : (
            <VisualPanel />
          )}
        </FilterPopup>
      }
    />
  );
  return overlay.id === "semantic" ? (
    <Menu.FilterProvider
      filter={null}
      value={query}
      onValueChange={onValueChange}
      autoHighlight
    >
      {submenu}
    </Menu.FilterProvider>
  ) : (
    submenu
  );
}

interface FieldProps {
  rows: Predicate[];
  onChange: (rows: Predicate[]) => void;
}

function GroupSubmenu({
  group,
  fields,
  optionsFor,
  ...fieldProps
}: FieldProps & {
  group: FilterMenuGroup;
  fields: readonly FieldId[];
  optionsFor: (field: FieldId) => FilterOption[];
}) {
  return (
    <Submenu
      icon={group.icon}
      label={group.label}
      popup={
        <FilterPopup aria-label={`${group.label} Filters`}>
          {fields.map((field) => (
            <FieldSubmenu
              key={field}
              field={field}
              options={optionsFor(field)}
              {...fieldProps}
            />
          ))}
        </FilterPopup>
      }
    />
  );
}

function FieldSubmenu({
  field,
  crumb,
  options,
  rows,
  onChange,
}: FieldProps & {
  field: FieldId;
  crumb?: string;
  options: FilterOption[];
}) {
  const { query, onValueChange } = useMenuFilterQuery();
  const label = FIELD_META[field].label;
  const submenu = (
    <Submenu
      icon={fieldIcon(field)}
      label={label}
      crumb={crumb}
      popup={
        <FilterPopup
          layout={filterLayout(field, options.length)}
          aria-label={`${label} Filter`}
        >
          <FilterEditor
            field={field}
            options={options}
            matching={selectedChoiceMode(rows, field)}
            rows={rows}
            search={query}
            onChange={onChange}
          />
        </FilterPopup>
      }
    />
  );
  return editorIsSearchable(field, options.length) ? (
    <Menu.FilterProvider
      filter={null}
      value={query}
      onValueChange={onValueChange}
      autoHighlight
    >
      {submenu}
    </Menu.FilterProvider>
  ) : (
    submenu
  );
}

function isChoiceField(field: FieldId): boolean {
  const type = FIELD_META[field].type;
  return type === "enum" || type === "stringArray";
}

function optionValue(option: FilterOption): string {
  const raw = Array.isArray(option.predicate.value)
    ? option.predicate.value[0]
    : option.predicate.value;
  return String(raw).toLowerCase();
}

function wordStarts(text: string): number[] {
  return [...text].flatMap((_, index) =>
    index === 0 || !/[\p{L}\p{N}]/u.test(text[index - 1] ?? "") ? [index] : [],
  );
}

/** Mid-word hits like "sor" inside a hash-named tag are noise at the root. */
function matchesWordStart(label: string, needle: string): boolean {
  const text = label.toLowerCase();
  return wordStarts(text).some((start) => text.startsWith(needle, start));
}

/** Field names are short, so letters in order from a word start ("sor" → Source) are safe to match. */
function matchesInOrder(label: string, needle: string): boolean {
  const text = label.toLowerCase();
  return wordStarts(text).some((start) => {
    let position = start;
    for (const char of needle) {
      const found = text.indexOf(char, position);
      if (found === -1) return false;
      position = found + 1;
    }
    return text[start] === needle[0];
  });
}

function FieldValues({
  field,
  options,
  rows,
  onChange,
}: {
  field: FieldId;
  options: { option: FilterOption; count?: number }[];
  rows: Predicate[];
  onChange: (rows: Predicate[]) => void;
}) {
  const choice = isChoiceField(field);
  const matching = selectedChoiceMode(rows, field);
  const Icon = fieldIcon(field);
  return options.map(({ option, count }) => {
    const checked = choice
      ? isChoiceSelected(rows, option.predicate, matching)
      : isFilterSelected(rows, option.predicate);
    return (
      <Menu.Item
        key={option.label}
        onClick={() =>
          onChange(
            choice
              ? selectChoice(rows, option.predicate, !checked, matching)
              : selectFilter(rows, option.predicate, !checked),
          )
        }
      >
        <Menu.ItemIcon>
          <Icon />
        </Menu.ItemIcon>
        <Menu.ItemLabel>
          <span data-menu-breadcrumb="">{FIELD_META[field].label}</span>
          <span aria-hidden data-menu-breadcrumb-separator="">
            ›
          </span>
          <span data-menu-breadcrumb-current="">{option.label}</span>
        </Menu.ItemLabel>
        {count === undefined ? null : (
          <Menu.SecondaryLabel>{count}</Menu.SecondaryLabel>
        )}
      </Menu.Item>
    );
  });
}
