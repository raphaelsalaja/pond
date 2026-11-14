import { IconPlus } from "@pond/icons";
import { Button, Chip, Keyboard, Menu } from "@pond/ui";
import type { ReactNode } from "react";
import { useMenuFilterQuery } from "@/shared/hooks/use-menu-filter-query";
import { placeCreateOptionLast } from "@/shared/lib/picker-order";
import { chordGlyphs } from "@/shared/lib/shortcuts";
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
  onStartBatch?(): void;
  batch?: {
    staged: ReadonlySet<string>;
    onToggle(option: AssignOption): void;
    onApply(): void;
    onCancel(): void;
    applying?: boolean;
  };
}

const APPLY_CHORD = "Mod+Enter";

function sortKey(option: AssignOption): string {
  return option.crumb ? `${option.crumb} ${option.label}` : option.label;
}

export function AssignMenu({
  noun,
  options,
  suggested,
  onToggle,
  onCreate,
  onStartBatch,
  batch,
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
  const row = (option: AssignOption) => {
    const staged = batch?.staged.has(option.key) ?? false;
    const assigned = option.state === "on";
    const mixed = option.state === "mixed";
    return (
      <Menu.CheckboxItem
        key={option.key}
        closeOnClick={false}
        checked={batch ? assigned || staged : assigned}
        disabled={Boolean(batch && assigned)}
        data-selection={option.state}
        aria-description={
          assigned
            ? batch
              ? "Already assigned"
              : undefined
            : mixed
              ? "Some selected"
              : undefined
        }
        onCheckedChange={() =>
          batch ? batch.onToggle(option) : onToggle(option)
        }
      >
        <Menu.CheckboxItemIndicator
          reveal="active"
          indeterminate={mixed && !staged}
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
  };
  const stagedCount = batch?.staged.size ?? 0;
  const addLabel = `Add to ${stagedCount} ${stagedCount === 1 ? noun : plural}`;
  return (
    <Menu.FilterProvider
      filter={null}
      value={query}
      onValueChange={onValueChange}
      autoHighlight
    >
      <Menu.Root
        onOpenChange={(open, details) => {
          if (open) reset();
          else if (batch && details.reason === "escape-key") {
            details.cancel();
            batch.onCancel();
          } else batch?.onCancel();
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
                onKeyDown={(event) => {
                  if (
                    !batch ||
                    event.key !== "Enter" ||
                    !(event.metaKey || event.ctrlKey)
                  )
                    return;
                  event.preventDefault();
                  event.preventBaseUIHandler();
                  if (stagedCount && !batch.applying) batch.onApply();
                }}
              />
              {onStartBatch && !batch ? (
                <>
                  <Menu.Item closeOnClick={false} onClick={onStartBatch}>
                    <Menu.ItemLabel>Select Multiple</Menu.ItemLabel>
                  </Menu.Item>
                  <Menu.Separator />
                </>
              ) : null}
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
              {batch ? (
                <div className={styles.actions}>
                  <Keyboard.Cluster
                    className={styles.hint}
                    keys={chordGlyphs(APPLY_CHORD)}
                    density="flat"
                  />
                  <Button size="xs" variant="ghost" onClick={batch.onCancel}>
                    Cancel
                  </Button>
                  <Button
                    size="xs"
                    variant="primary"
                    disabled={!stagedCount}
                    loading={batch.applying}
                    aria-label={addLabel}
                    aria-keyshortcuts="Meta+Enter"
                    onClick={batch.onApply}
                  >
                    {addLabel}
                  </Button>
                </div>
              ) : null}
            </Chip.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </Menu.FilterProvider>
  );
}
