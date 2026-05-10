import { FIELD_META } from "@pond/schema/filters/meta";
import { Input } from "@pond/ui";
import type { DropdownProps } from "@/components/filter-bar/dropdowns/types";
import styles from "./styles.module.css";

/**
 * Free-text input for `string`-typed fields (`creator`, `url`).
 *
 * The comparator stays whatever the chip set it to (`contains`,
 * `eq`, `startsWith`, …); we only edit the predicate's value.
 */
export function StringDropdown({ predicate, onChange }: DropdownProps) {
  const meta = FIELD_META[predicate.field];
  const value = typeof predicate.value === "string" ? predicate.value : "";

  return (
    <div className={styles.body}>
      <Input.Root
        type="search"
        value={value}
        autoFocus
        placeholder={meta.label}
        spellCheck={false}
        onChange={(e) => onChange({ ...predicate, value: e.target.value })}
      />
    </div>
  );
}
