import { Input, Menu } from "@pond/ui";
import { useMemo, useState } from "react";
import type { DropdownProps } from "@/components/filter-bar/dropdowns/types";
import styles from "./styles.module.css";

interface OptionalChoice {
  id: string;
  label: string;
  value: boolean;
}

const CHOICES: readonly OptionalChoice[] = [
  { id: "with", label: "With note", value: true },
  { id: "without", label: "Without note", value: false },
];

/**
 * Boolean toggle for `optional` fields (currently just `note`).
 * The picked value flips the `exists` comparator's argument: true
 * → "is set", false → "is not set".
 *
 * Includes a filter input for parity with the other dropdowns —
 * silly with two options today, but keeps the affordance
 * consistent so later optional fields don't feel oddly bare.
 */
export function OptionalDropdown({ predicate, onChange }: DropdownProps) {
  const [q, setQ] = useState("");
  const value = predicate.value !== false;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return CHOICES;
    return CHOICES.filter((c) => c.label.toLowerCase().includes(needle));
  }, [q]);

  return (
    <div className={styles.body}>
      <div className={styles.search}>
        <Input.Root
          type="search"
          value={q}
          placeholder="Filter…"
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          spellCheck={false}
        />
      </div>
      {filtered.map((choice) => (
        <Menu.Item
          key={choice.id}
          onClick={() =>
            onChange({ ...predicate, cmp: "exists", value: choice.value })
          }
          data-active={value === choice.value ? "true" : undefined}
        >
          <Menu.ItemLabel>{choice.label}</Menu.ItemLabel>
        </Menu.Item>
      ))}
      {filtered.length === 0 ? (
        <div className={styles.empty}>No matches.</div>
      ) : null}
    </div>
  );
}
