export const DATE_PRESETS = [
  { id: "1d", label: "Today", iso: "-P1D" },
  { id: "3d", label: "Past 3 days", iso: "-P3D" },
  { id: "1w", label: "Past week", iso: "-P1W" },
  { id: "1mo", label: "Past month", iso: "-P1M" },
  { id: "3mo", label: "Past 3 months", iso: "-P3M" },
  { id: "1y", label: "Past year", iso: "-P1Y" },
] as const;
