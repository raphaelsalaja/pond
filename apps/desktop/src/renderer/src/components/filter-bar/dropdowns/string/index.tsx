import { FIELD_META } from "@pond/schema/filters/meta";
import { Input } from "@pond/ui";
import type { DropdownProps } from "@/components/filter-bar/dropdowns/types";
import styles from "./styles.module.css";

export function StringDropdown({ predicate, onChange }: DropdownProps) {
  const meta = FIELD_META[predicate.field];
  const value = typeof predicate.value === "string" ? predicate.value : "";

  return (
    <div className={styles.body}>
      <Input
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
