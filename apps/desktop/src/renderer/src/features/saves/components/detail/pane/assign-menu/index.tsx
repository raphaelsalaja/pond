import { IconPlus } from "@pond/icons";
import { Button, Chip, Menu } from "@pond/ui";
import type { ReactNode } from "react";
import { useMenuFilterQuery } from "@/shared/hooks/use-menu-filter-query";
import { placeCreateOptionLast } from "@/shared/lib/picker-order";
import styles from "./styles.module.css";

export interface AssignOption {
  key: string;
  label: string;
  crumb?: string;
  icon: ReactNode;
  state: "on" | "mixed" | "off";
}

interface AssignMenuProps {
  noun: "Tag" | "Folder";
  options: readonly AssignOption[];
  suggested?: ReadonlySet<string>;
  onToggle(option: AssignOption): void;
  onCreate?(name: string): void;
}

function sortKey(option: AssignOption): string {
  return option.crumb ? `${option.crumb} ${option.label}` : option.label;
}

export function AssignMenu({
  noun,
  options,
  suggested,
  onToggle,
  onCreate,
}: AssignMenuProps) {
  const { query, onValueChange, reset } = useMenuFilterQuery();
  const plural = `${noun}s`;
  const needle = query.trim().toLowerCase();
  const matches = options
    .filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        option.crumb?.toLowerCase().includes(needle),
    )
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const picks =
    !needle && suggested?.size
      ? matches.filter((option) => suggested.has(option.key))
      : [];
  const rest = picks.length
    ? matches.filter((option) => !suggested?.has(option.key))
    : matches;
  const creatable = Boolean(
    onCreate &&
      needle &&
      !options.some((option) => option.label.toLowerCase() === needle),
  );
  const entries = placeCreateOptionLast(
    rest.map((option) => ({ kind: "option" as const, option })),
    creatable ? { kind: "create" as const, name: query.trim() } : null,
  );
  const row = (option: AssignOption) => (
    <Menu.CheckboxItem
      key={option.key}
      closeOnClick={false}
      checked={option.state === "on"}
      data-selection={option.state}
      aria-description={option.state === "mixed" ? "Some selected" : undefined}
      onCheckedChange={() => onToggle(option)}
    >
      <Menu.CheckboxItemIndicator
        reveal="active"
        indeterminate={option.state === "mixed"}
      />
      <Menu.ItemIcon>{option.icon}</Menu.ItemIcon>
      <Menu.ItemLabel
        title={
          option.crumb ? `${option.crumb} › ${option.label}` : option.label
        }
      >
        {option.crumb ? (
          <>
            <span data-menu-breadcrumb="">{option.crumb}</span>
            <span aria-hidden data-menu-breadcrumb-separator="">
              ›
            </span>
            <span data-menu-breadcrumb-current="">{option.label}</span>
          </>
        ) : (
          option.label
        )}
      </Menu.ItemLabel>
    </Menu.CheckboxItem>
  );
  return (
    <Menu.FilterProvider
      filter={null}
      value={query}
      onValueChange={onValueChange}
      autoHighlight
    >
      <Menu.Root
        onOpenChange={(open) => {
          if (open) reset();
        }}
      >
        <Menu.Trigger
          render={
            <Button
              type="button"
              icon
              variant="ghost"
              size="xs"
              aria-label={`Add ${noun}`}
            />
          }
        >
          <IconPlus />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="left" align="start" sideOffset={8}>
            <Chip.Popup className={styles.popup} aria-label={plural}>
              <Menu.Input
                aria-label={`Search ${plural}`}
                placeholder={`Search ${plural.toLowerCase()}…`}
              />
              <Menu.FilterList className={styles.list}>
                {picks.length ? (
                  <>
                    <Menu.SectionLabel>Suggested</Menu.SectionLabel>
                    {picks.map(row)}
                    {rest.length ? <Menu.Separator /> : null}
                  </>
                ) : null}
                {entries.map((entry) => {
                  if (entry.kind === "option") return row(entry.option);
                  return (
                    <Menu.Item
                      key="create"
                      closeOnClick={false}
                      onClick={() => {
                        onCreate?.(entry.name);
                        reset();
                      }}
                    >
                      <Menu.ItemIcon>
                        <IconPlus />
                      </Menu.ItemIcon>
                      <Menu.ItemLabel>{`Create “${entry.name}”`}</Menu.ItemLabel>
                    </Menu.Item>
                  );
                })}
                {!matches.length && !creatable ? (
                  <Menu.Item disabled>
                    <Menu.ItemLabel>
                      {needle ? "No matches" : `No ${plural.toLowerCase()}`}
                    </Menu.ItemLabel>
                  </Menu.Item>
                ) : null}
              </Menu.FilterList>
            </Chip.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </Menu.FilterProvider>
  );
}
