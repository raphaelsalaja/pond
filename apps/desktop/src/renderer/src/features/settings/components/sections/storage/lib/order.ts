import type { StorageOrder } from "@shared/storage-insights";

export const ORDER_OPTIONS: Array<{ value: StorageOrder; label: string }> = [
  { value: "largest", label: "Largest First" },
  { value: "smallest", label: "Smallest First" },
];
