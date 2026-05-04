import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui";
import {
  clearFilter,
  type FilterId,
  type FilterValues,
  readFilters,
  writeFilter,
} from "./filters";
import { ChevronDownIcon, XmarkIcon } from "./icons";
import { getFilterDef } from "./registry";
import styles from "./styles.module.css";

interface FilterChipProps {
  id: FilterId;
  /** When true, render as the inert "always-visible" chip in the bar
   * (no remove button, but still opens the dropdown). When false, the
   * chip represents an active filter with a value pill + remove. */
  variant?: "passive" | "active";
}

/**
 * Reusable chip that renders the icon, label, optional value preview,
 * a remove button (when active), and opens the filter-specific
 * dropdown on click. State is read/written via URL search params so
 * the chip works in any view that shares the route.
 *
 * The K binding lives in `FilterValues[id]` for the read/write path
 * but is erased at the component boundary — the `defineFilter`
 * helper in `registry.tsx` keeps the per-filter declaration sound,
 * and the chip just funnels values through `unknown`.
 */
export function FilterChip({ id, variant = "passive" }: FilterChipProps) {
  const def = getFilterDef(id);
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  if (!def) return null;
  const values = readFilters(params);
  const value = values[id];
  const preview = def.previewValue(value);
  const isScaffold = def.status === "scaffold";

  function update(next: unknown) {
    const nextParams = writeFilter(params, id, next as FilterValues[typeof id]);
    setParams(nextParams, { replace: true });
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    setParams(clearFilter(params, id), { replace: true });
  }

  const Icon = def.icon;
  const Dropdown = def.Dropdown;

  const isActive = variant === "active";
  const showPreview = isActive && preview !== null && preview !== undefined;

  // We render the close affordance as a sibling button rather than
  // nesting one inside the trigger button — nested interactive
  // elements aren't valid HTML and break keyboard focus order.
  return (
    <span
      className={[
        styles.chipWrap,
        isActive ? styles.chipWrapActive : "",
        isScaffold ? styles.chipWrapScaffold : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className={[
                styles.chip,
                isActive ? styles.chipActive : "",
                isScaffold ? styles.chipScaffold : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-state={open ? "open" : "closed"}
              data-filter-id={id}
              aria-label={def.label}
            >
              <span className={styles.chipIcon} aria-hidden>
                <Icon width="1em" height="1em" />
              </span>
              <span className={styles.chipLabel}>{def.label}</span>
              {showPreview ? (
                <span className={styles.chipValue}>{preview}</span>
              ) : null}
              {!isActive ? (
                <span className={styles.chipChevron} aria-hidden>
                  <ChevronDownIcon width="0.7em" height="0.7em" />
                </span>
              ) : null}
            </button>
          }
        />
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={6}
          className={styles.popover}
        >
          <Dropdown value={value} onChange={update} />
        </PopoverContent>
      </Popover>
      {isActive ? (
        <button
          type="button"
          aria-label={`Remove ${def.label} filter`}
          className={styles.chipClose}
          onClick={clear}
        >
          <XmarkIcon width="0.65em" height="0.65em" />
        </button>
      ) : null}
    </span>
  );
}
