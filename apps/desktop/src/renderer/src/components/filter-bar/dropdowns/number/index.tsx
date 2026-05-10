import { FIELD_META } from "@pond/schema/filters/meta";
import { Input, Menu } from "@pond/ui";
import { useMemo, useState } from "react";
import type { DropdownProps } from "@/components/filter-bar/dropdowns/types";
import styles from "./styles.module.css";

/**
 * Number-typed field dropdown. Renders a filterable list of the
 * field's `presets` plus a custom min/max range input. Picking a
 * preset writes a single-bound predicate (`gte` / `lte`) when the
 * preset has one bound, or `between` when it has both. The custom
 * row always writes `between`.
 *
 * Used by `size`, `dimensions`, `duration`. The semantics of the
 * raw number depend on the field — bytes for size, pixels for
 * dimensions, seconds for duration — but the input shape is the
 * same.
 */
export function NumberDropdown({ predicate, onChange }: DropdownProps) {
  const [q, setQ] = useState("");
  const meta = FIELD_META[predicate.field];
  const presets = meta.presets ?? [];
  const value = predicate.value;
  const [min, max] =
    Array.isArray(value) && value.length === 2 ? value : [null, null];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return presets;
    return presets.filter((p) => p.label.toLowerCase().includes(needle));
  }, [presets, q]);

  function applyPreset(presetValue: unknown) {
    const n =
      typeof presetValue === "number" ? presetValue : Number(presetValue);
    if (!Number.isFinite(n)) return;
    onChange({ ...predicate, cmp: "lte", value: n });
  }

  function setRange(nextMin: string, nextMax: string) {
    const lo = nextMin === "" ? null : Number(nextMin);
    const hi = nextMax === "" ? null : Number(nextMax);
    if (lo !== null && hi !== null) {
      onChange({ ...predicate, cmp: "between", value: [lo, hi] });
      return;
    }
    if (lo !== null) {
      onChange({ ...predicate, cmp: "gte", value: lo });
      return;
    }
    if (hi !== null) {
      onChange({ ...predicate, cmp: "lte", value: hi });
      return;
    }
    onChange({ ...predicate, cmp: "between", value: [0, 0] });
  }

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
      {filtered.map((p) => (
        <Menu.Item key={p.id} onClick={() => applyPreset(p.value)}>
          <Menu.ItemLabel>{p.label}</Menu.ItemLabel>
        </Menu.Item>
      ))}
      {filtered.length === 0 ? (
        <div className={styles.empty}>No matches.</div>
      ) : null}
      <Menu.Separator />
      <div className={styles.range}>
        <Input.Root
          type="number"
          inputMode="numeric"
          placeholder="min"
          value={min == null ? "" : String(min)}
          onChange={(e) =>
            setRange(e.target.value, max == null ? "" : String(max))
          }
        />
        <span className={styles.dash} aria-hidden>
          –
        </span>
        <Input.Root
          type="number"
          inputMode="numeric"
          placeholder="max"
          value={max == null ? "" : String(max)}
          onChange={(e) =>
            setRange(min == null ? "" : String(min), e.target.value)
          }
        />
      </div>
    </div>
  );
}
