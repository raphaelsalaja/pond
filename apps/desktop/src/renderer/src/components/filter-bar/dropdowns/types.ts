import type { Predicate } from "@pond/schema/filters/types";

export interface DropdownProps {
  predicate: Predicate;
  onChange: (next: Predicate) => void;
}
