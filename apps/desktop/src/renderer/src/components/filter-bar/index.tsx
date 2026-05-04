import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui";
import { FilterChip } from "./chip";
import { activeFilterIds, type FilterId, readFilters } from "./filters";
import { PlusIcon } from "./icons";
import { FILTER_DEFS, getFilterDef } from "./registry";
import styles from "./styles.module.css";

export type { FilterId } from "./filters";

/**
 * Eagle-style filter chip rail. Renders the canonical row of chips
 * (one per filter definition) plus an "Add filter" overflow popover
 * for chips that aren't on the visible row by default.
 *
 * The rail is purely visual — every chip reads/writes its value via
 * URL search params, so the bar can mount in any layout (currently
 * the global header) and stay in sync with `<SavesView>`.
 */
export function FilterBar() {
  const [params] = useSearchParams();
  const filters = readFilters(params);
  const active = useMemo(() => new Set(activeFilterIds(filters)), [filters]);
  return (
    <div className={styles.bar} role="toolbar" aria-label="Filters">
      {FILTER_DEFS.map((def) => (
        <FilterChip
          key={def.id}
          id={def.id}
          variant={active.has(def.id) ? "active" : "passive"}
        />
      ))}
      <AddFilterMenu />
    </div>
  );
}

/**
 * The trailing `+` button. Mirrors Eagle's "Add filter" affordance —
 * clicking pops a list of every defined filter (including scaffolds,
 * marked as such), and selecting one scrolls/focuses the existing
 * chip in the bar. We don't need to persist the "added" state since
 * every chip is always rendered; this menu primarily serves as a
 * keyboard-reachable index for users who don't want to scan the row.
 */
function AddFilterMenu() {
  const [open, setOpen] = useState(false);
  function jumpTo(id: FilterId) {
    setOpen(false);
    queueMicrotask(() => {
      const target = document.querySelector<HTMLElement>(
        `[data-filter-id="${id}"]`,
      );
      target?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
      target?.focus({ preventScroll: true });
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={`${styles.chip} ${styles.addFilter}`}
            aria-label="Add filter"
          >
            <span className={styles.chipIcon} aria-hidden>
              <PlusIcon width="0.85em" height="0.85em" />
            </span>
          </button>
        }
      />
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        className={styles.addPopover}
      >
        <p className={styles.addLabel}>Add filter</p>
        <ul className={styles.addList}>
          {FILTER_DEFS.map((def) => {
            const Icon = def.icon;
            const isScaffold = def.status === "scaffold";
            return (
              <li key={def.id}>
                <button
                  type="button"
                  className={styles.addItem}
                  onClick={() => jumpTo(def.id)}
                >
                  <span className={styles.addItemIcon} aria-hidden>
                    <Icon width="1em" height="1em" />
                  </span>
                  <span className={styles.addItemLabel}>{def.label}</span>
                  {isScaffold ? (
                    <span className={styles.addItemChip}>Soon</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Read-only helper — exported so other surfaces (e.g. the saves view
 * empty-state messaging) can decide whether to show "no matches" vs.
 * "no saves yet".
 */
export function useActiveFilterCount(): number {
  const [params] = useSearchParams();
  return activeFilterIds(readFilters(params)).length;
}

export { getFilterDef, readFilters };
