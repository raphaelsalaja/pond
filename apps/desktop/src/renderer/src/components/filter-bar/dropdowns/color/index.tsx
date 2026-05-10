import { Input } from "@pond/ui";
import { useMemo } from "react";
import type { DropdownProps } from "@/components/filter-bar/dropdowns/types";
import { useSaves } from "@/pool/hooks";
import styles from "./styles.module.css";

/**
 * Color picker. Surfaces a swatch grid of the most common
 * dominant colors in the library (the ones the enrichment worker
 * has actually seen) plus a hex input that doubles as a search
 * box: typing a hex prefix filters the swatch grid down to
 * matches and at the same time writes the predicate's `near`
 * target. The chip's `near` predicate carries `{ hex, distance }`
 * — distance defaults to 96 (a comfortable Manhattan radius) and
 * stays implicit unless the user types one.
 */
export function ColorDropdown({ predicate, onChange }: DropdownProps) {
  const saves = useSaves();
  const swatches = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of saves) {
      if (s.deletedAt) continue;
      const list = s.dominantColors ?? [];
      for (const c of list) {
        const hex = c.hex.replace(/^#/, "").toLowerCase();
        if (!/^[0-9a-f]{6}$/.test(hex)) continue;
        counts.set(hex, (counts.get(hex) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 36)
      .map(([hex]) => hex);
  }, [saves]);

  const value = predicate.value;
  const currentHex =
    typeof value === "object" && value !== null
      ? String((value as { hex?: unknown }).hex ?? "")
          .replace(/^#/, "")
          .toLowerCase()
      : "";

  const filtered = useMemo(() => {
    if (!currentHex) return swatches;
    return swatches.filter((hex) => hex.startsWith(currentHex));
  }, [swatches, currentHex]);

  function pick(hex: string) {
    onChange({ ...predicate, cmp: "near", value: { hex } });
  }

  return (
    <div className={styles.body}>
      <div className={styles.search}>
        <Input.Root
          type="search"
          value={currentHex}
          autoFocus
          spellCheck={false}
          placeholder="ff0066"
          maxLength={6}
          onChange={(e) =>
            onChange({
              ...predicate,
              cmp: "near",
              value: { hex: e.target.value.replace(/^#/, "").toLowerCase() },
            })
          }
        />
      </div>
      <div className={styles.grid} role="listbox">
        {filtered.map((hex) => (
          <button
            key={hex}
            type="button"
            role="option"
            aria-label={`#${hex}`}
            aria-selected={hex === currentHex}
            className={styles.swatch}
            style={{ background: `#${hex}` }}
            onClick={() => pick(hex)}
          />
        ))}
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            {currentHex ? "No matches." : "No colors detected yet."}
          </div>
        ) : null}
      </div>
    </div>
  );
}
