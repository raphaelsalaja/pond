import type { Predicate } from "@pond/schema/filters/types";

/**
 * Generic dropdown contract. Each dropdown reads + writes the
 * predicate's `value` (and optionally `cmp` if the input shape
 * implies a different comparator, e.g. a between-range form
 * promoting a `gte` predicate to a `between` one).
 */
export interface DropdownProps {
  predicate: Predicate;
  onChange: (next: Predicate) => void;
}
