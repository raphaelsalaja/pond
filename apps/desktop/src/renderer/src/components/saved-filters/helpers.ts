import { extractFilterKeys } from "@pond/schema/filters/url";

const FILTER_KEYS = extractFilterKeys();

export function extractFilterParams(
  params: URLSearchParams,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value !== null && value !== "") out[key] = value;
  }
  for (const key of FILTER_KEYS) {
    const all = params.getAll(key);
    if (all.length <= 1) continue;
    all.forEach((value, idx) => {
      if (idx === 0) return;
      out[`${key}__${idx}`] = value;
    });
  }
  return out;
}

export function applyFilterParams(
  params: URLSearchParams,
  saved: Record<string, string>,
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of FILTER_KEYS) next.delete(key);

  const buckets = new Map<string, string[]>();
  for (const [k, v] of Object.entries(saved)) {
    if (!v) continue;
    const m = k.match(/^(.+?)__(\d+)$/);
    const baseKey = m ? m[1] : k;
    if (!baseKey) continue;
    const list = buckets.get(baseKey) ?? [];
    list.push(v);
    buckets.set(baseKey, list);
  }
  for (const [baseKey, values] of buckets) {
    if (!FILTER_KEYS.includes(baseKey)) continue;
    for (const v of values) next.append(baseKey, v);
  }
  return next;
}

export function filterParamsEqual(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}
