import { Input, Menu } from "@pond/ui";
import { useMemo, useState } from "react";
import { DATE_PRESETS } from "@/components/filter-bar/date-presets";
import type { DropdownProps } from "@/components/filter-bar/dropdowns/types";
import styles from "./styles.module.css";

/**
 * Date-typed field dropdown. Mirrors Linear's "Due date" picker:
 * a filterable list of relative-time presets, with a "Custom date
 * or timeframe…" row that expands to absolute from/to inputs.
 *
 * Pond's date fields all describe past events (a save was imported,
 * a page was published, a row was last touched), so the presets
 * read as "Past X" rather than "X from now". The values encode as
 * ISO 8601 durations with a leading minus sign (`-P1W`, `-P3M`)
 * which the SQL builder + JS evaluator both resolve against
 * `Date.now()`.
 *
 * Presets are kept in `../../date-presets.ts` so the global Add
 * filter search index can flatten them into ranked rows without
 * dragging this whole picker into its import graph.
 */
export function DateDropdown({ predicate, onChange }: DropdownProps) {
  const [q, setQ] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const value = predicate.value;
  const [from, to] =
    Array.isArray(value) && value.length === 2
      ? (value as [string, string])
      : ["", ""];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return DATE_PRESETS;
    return DATE_PRESETS.filter((p) => p.label.toLowerCase().includes(needle));
  }, [q]);

  function applyPreset(iso: string) {
    onChange({ ...predicate, cmp: "gte", value: iso });
  }

  function setRange(nextFrom: string, nextTo: string) {
    if (nextFrom && nextTo) {
      onChange({
        ...predicate,
        cmp: "between",
        value: [`${nextFrom}T00:00:00.000Z`, `${nextTo}T23:59:59.999Z`],
      });
      return;
    }
    if (nextFrom) {
      onChange({
        ...predicate,
        cmp: "gte",
        value: `${nextFrom}T00:00:00.000Z`,
      });
      return;
    }
    if (nextTo) {
      onChange({
        ...predicate,
        cmp: "lte",
        value: `${nextTo}T23:59:59.999Z`,
      });
    }
  }

  function isoToYmd(raw: string): string {
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    return "";
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
        <Menu.Item key={p.id} onClick={() => applyPreset(p.iso)}>
          <Menu.ItemLabel>{p.label}</Menu.ItemLabel>
        </Menu.Item>
      ))}
      {filtered.length === 0 ? (
        <div className={styles.empty}>No matches.</div>
      ) : null}
      <Menu.Separator />
      <Menu.Item
        closeOnClick={false}
        onClick={() => setShowCustom((v) => !v)}
        data-active={showCustom ? "true" : undefined}
      >
        <Menu.ItemLabel>Custom date or timeframe…</Menu.ItemLabel>
      </Menu.Item>
      {showCustom ? (
        <div className={styles.range}>
          <Input.Root
            type="date"
            value={isoToYmd(from)}
            onChange={(e) => setRange(e.target.value, isoToYmd(to))}
          />
          <span className={styles.dash} aria-hidden>
            –
          </span>
          <Input.Root
            type="date"
            value={isoToYmd(to)}
            onChange={(e) => setRange(isoToYmd(from), e.target.value)}
          />
        </div>
      ) : null}
    </div>
  );
}
