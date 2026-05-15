import { IconCheckOutline18 } from "@pond/icons/outline/18";
import { Input, Menu } from "@pond/ui";
import { useMemo, useState } from "react";
import type { DropdownProps } from "@/components/filter-bar/dropdowns/types";
import { useSaves } from "@/pool/hooks";
import styles from "./styles.module.css";

export function TagsDropdown({ predicate, onChange }: DropdownProps) {
  const [q, setQ] = useState("");
  const saves = useSaves();

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of saves) {
      if (s.deletedAt) continue;
      for (const t of [...s.tags, ...s.aiTags]) {
        const key = t.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
  }, [saves]);

  const selected = useMemo(() => {
    const v = predicate.value;
    if (Array.isArray(v)) return new Set(v.map(String));
    if (typeof v === "string" && v) return new Set([v]);
    return new Set<string>();
  }, [predicate.value]);

  const filtered = tags.filter(([id]) => id.includes(q.trim().toLowerCase()));

  function toggle(tag: string) {
    const next = new Set(selected);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    onChange({
      ...predicate,
      value: Array.from(next),
    });
  }

  if (!tags.length) {
    return (
      <div className={styles.body}>
        <div className={styles.empty}>No tags yet.</div>
      </div>
    );
  }

  return (
    <div className={styles.body}>
      <div className={styles.search}>
        <Input
          type="search"
          value={q}
          placeholder="Filter tags…"
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          spellCheck={false}
        />
      </div>
      {filtered.map(([tag, count]) => {
        const checked = selected.has(tag);
        return (
          <Menu.CheckboxItem
            key={tag}
            closeOnClick={false}
            checked={checked}
            onCheckedChange={() => toggle(tag)}
          >
            <span className={styles.check} aria-hidden>
              {checked ? (
                <IconCheckOutline18 width="0.85em" height="0.85em" />
              ) : null}
            </span>
            <Menu.ItemLabel>{tag}</Menu.ItemLabel>
            <span className={styles.count}>{count}</span>
          </Menu.CheckboxItem>
        );
      })}
      {filtered.length === 0 ? (
        <div className={styles.empty}>No matches.</div>
      ) : null}
    </div>
  );
}
