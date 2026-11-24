import { createHash } from "node:crypto";

const orders = new Map<string, Map<string, number>>();
export function prepareManualOrder(ids: ReadonlyArray<string>): string {
  const key = createHash("sha256").update(ids.join("\0")).digest("hex");
  if (!orders.has(key)) {
    orders.set(key, new Map(ids.map((id, index) => [id, index])));
  }
  if (orders.size > 8) {
    const oldest = orders.keys().next().value;
    if (oldest) {
      orders.delete(oldest);
    }
  }
  return key;
}
export function manualOrderRank(orderKey: string, id: string): number | null {
  return orders.get(orderKey)?.get(id) ?? null;
}
