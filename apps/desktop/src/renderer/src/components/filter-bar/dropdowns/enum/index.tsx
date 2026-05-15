import { IconCheckOutline18 } from "@pond/icons/outline/18";
import { FIELD_META } from "@pond/schema/filters/meta";
import { Input, Menu } from "@pond/ui";
import { useMemo, useState } from "react";
import type { DropdownProps } from "@/components/filter-bar/dropdowns/types";
import styles from "./styles.module.css";

export function EnumDropdown({ predicate, onChange }: DropdownProps) {
  const [q, setQ] = useState("");
  const meta = FIELD_META[predicate.field];
  const presets = meta.presets ?? [];

  const selected = useMemo(() => {
    const v = predicate.value;
    if (Array.isArray(v)) return new Set(v.map(String));
    if (typeof v === "string" && v) return new Set([v]);
    return new Set<string>();
  }, [predicate.value]);

  const filtered = presets.filter((p) =>
    p.label.toLowerCase().includes(q.trim().toLowerCase()),
  );

  function toggle(value: unknown) {
    const next = new Set(selected);
    const key = String(value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const list = Array.from(next);
    if (list.length === 1) {
      onChange({
        ...predicate,
        cmp: predicate.cmp === "neq" || predicate.cmp === "nin" ? "neq" : "eq",
        value: list[0] ?? "",
      });
      return;
    }
    onChange({
      ...predicate,
      cmp: predicate.cmp === "neq" || predicate.cmp === "nin" ? "nin" : "in",
      value: list,
    });
  }

  if (!presets.length) {
    return (
      <div className={styles.body}>
        <div className={styles.empty}>Nothing to pick.</div>
      </div>
    );
  }

  return (
    <div className={styles.body}>
      <div className={styles.search}>
        <Input
          type="search"
          value={q}
          placeholder={`Filter ${meta.label.toLowerCase()}…`}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          spellCheck={false}
        />
      </div>
      {filtered.map((p) => {
        const checked = selected.has(String(p.value));
        return (
          <Menu.CheckboxItem
            key={p.id}
            closeOnClick={false}
            checked={checked}
            onCheckedChange={() => toggle(p.value)}
          >
            <span className={styles.check} aria-hidden>
              {checked ? (
                <IconCheckOutline18 width="0.85em" height="0.85em" />
              ) : null}
            </span>
            <Menu.ItemLabel>{p.label}</Menu.ItemLabel>
          </Menu.CheckboxItem>
        );
      })}
      {filtered.length === 0 ? (
        <div className={styles.empty}>No matches.</div>
      ) : null}
    </div>
  );
}
