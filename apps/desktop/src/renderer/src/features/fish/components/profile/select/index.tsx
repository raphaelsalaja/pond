import { IconPlus, IconXmark } from "@pond/icons";
import { Button, Chip, Empty, Menu } from "@pond/ui";
import { FISH_SCOPE_CAP } from "@shared/fish-contracts";
import { useId } from "react";
import type { ReactNode } from "react";
import { useMenuFilterQuery } from "@/shared/hooks/use-menu-filter-query";
import styles from "./styles.module.css";

export interface ScopeItem {
  value: string;
  label: string;
  crumb?: string;
  icon?: ReactNode;
}

interface FieldProps {
  noun: "Folder" | "Tag";
  value: Array<string>;
  items: Array<ScopeItem>;
  onChange: (value: Array<string>) => void;
}

function Field({ noun, value, items, onChange }: FieldProps) {
  const id = useId();
  const plural = `${noun}s`;
  const byValue = new Map(items.map((item) => [item.value, item]));
  const selected = value.map(
    (item) => byValue.get(item) ?? { value: item, label: item },
  );
  function toggle(item: string) {
    onChange(
      value.includes(item)
        ? value.filter((entry) => entry !== item)
        : [...value, item].slice(0, FISH_SCOPE_CAP),
    );
  }
  return (
    <section className={styles.section} aria-labelledby={id}>
      <div className={styles.header} data-action="">
        <h3 id={id} className={styles.title}>
          {plural}
        </h3>
        <Picker noun={noun} items={items} value={value} onToggle={toggle} />
      </div>
      {selected.length ? (
        <div className={styles.list}>
          {selected.map((item) => (
            <span key={item.value} className={styles.chip}>
              <span className={styles.label} title={itemTitle(item)}>
                {item.crumb ? (
                  <>
                    <span className={styles.crumb}>{item.crumb}</span>
                    <span aria-hidden className={styles.separator}>
                      ›
                    </span>
                  </>
                ) : null}
                <span className={styles.name}>{item.label}</span>
              </span>
              <Button
                icon
                size="xs"
                variant="ghost"
                className={styles.remove}
                aria-label={`Remove ${noun.toLowerCase()} ${item.label}`}
                onClick={() => toggle(item.value)}
              >
                <IconXmark size={12} />
              </Button>
            </span>
          ))}
        </div>
      ) : (
        <Empty.Root size="inline" variant="dashed">
          <Empty.Description>No {plural} Selected</Empty.Description>
        </Empty.Root>
      )}
    </section>
  );
}

function itemTitle(item: ScopeItem): string {
  return item.crumb ? `${item.crumb} › ${item.label}` : item.label;
}

function Picker({
  noun,
  items,
  value,
  onToggle,
}: {
  noun: "Folder" | "Tag";
  items: Array<ScopeItem>;
  value: Array<string>;
  onToggle: (value: string) => void;
}) {
  const { query, onValueChange, reset } = useMenuFilterQuery();
  const plural = `${noun}s`;
  const needle = query.trim().toLowerCase();
  const matches = items
    .filter(
      (item) =>
        item.label.toLowerCase().includes(needle) ||
        item.crumb?.toLowerCase().includes(needle),
    )
    .sort((a, b) => itemTitle(a).localeCompare(itemTitle(b)));
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
            <Button icon variant="ghost" size="xs" aria-label={`Add ${noun}`} />
          }
        >
          <IconPlus />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="left" align="start" sideOffset={8}>
            <Chip.Popup className={styles.popup} aria-label={plural}>
              <Menu.Input
                aria-label={`Search ${plural}`}
                placeholder="Search…"
              />
              <Menu.FilterList className={styles.menu}>
                {matches.map((item) => (
                  <Menu.CheckboxItem
                    key={item.value}
                    closeOnClick={false}
                    checked={value.includes(item.value)}
                    onCheckedChange={() => onToggle(item.value)}
                  >
                    <Menu.CheckboxItemIndicator reveal="active" />
                    {item.icon ? (
                      <Menu.ItemIcon>{item.icon}</Menu.ItemIcon>
                    ) : null}
                    <Menu.ItemLabel title={itemTitle(item)}>
                      {item.crumb ? (
                        <>
                          <span data-menu-breadcrumb="">{item.crumb}</span>
                          <span aria-hidden data-menu-breadcrumb-separator="">
                            ›
                          </span>
                          <span data-menu-breadcrumb-current="">
                            {item.label}
                          </span>
                        </>
                      ) : (
                        item.label
                      )}
                    </Menu.ItemLabel>
                  </Menu.CheckboxItem>
                ))}
                {!matches.length ? (
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

export const FishSelect = { Field };
