/**
 * Shared date presets — one source of truth used by the
 * `DateDropdown` and the global Add filter search index. Adding
 * a preset here lights it up in both the per-field date picker
 * and the global flat search.
 *
 * The renderer (JS evaluator) + main process (SQL builder) both
 * understand the `-PnD/-PnW/-PnM/-PnY` shape via `resolveNumeric`
 * in `@pond/schema/filters/match`.
 *
 * Lives in its own file so registry.tsx and `dropdowns/date` can
 * both depend on it without forming a runtime import cycle.
 */

export const DATE_PRESETS = [
  { id: "1d", label: "Today", iso: "-P1D" },
  { id: "3d", label: "Past 3 days", iso: "-P3D" },
  { id: "1w", label: "Past week", iso: "-P1W" },
  { id: "1mo", label: "Past month", iso: "-P1M" },
  { id: "3mo", label: "Past 3 months", iso: "-P3M" },
  { id: "1y", label: "Past year", iso: "-P1Y" },
] as const;
