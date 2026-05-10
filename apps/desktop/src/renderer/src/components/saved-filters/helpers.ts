/**
 * Saved-view URL helpers. The chip bar writes the active filter
 * into a fixed set of URL keys (`f.<field>` plus an optional
 * `q=<base64>`); these helpers extract / restore / compare the
 * filter-owned slice of `URLSearchParams` so the saved-filters
 * popover can round-trip without clobbering search query, sort,
 * view, or the open save id.
 */

import { extractFilterKeys } from "@pond/schema/filters/url";

const FILTER_KEYS = extractFilterKeys();

/**
 * Read every filter-owned key out of `params`. Returned as a flat
 * `Record<string, string>` so it round-trips through Drizzle's
 * JSON column and the `Prefs.views.saved[].params` shape.
 */
export function extractFilterParams(
  params: URLSearchParams,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value !== null && value !== "") out[key] = value;
  }
  // Compact form supports multiple values for the same `f.<field>`
  // key; preserve the first occurrence here and stash the rest
  // under suffixed keys so the apply-back path can rebuild them.
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

/**
 * Apply a saved filter back onto `params` — wipe every existing
 * filter key first, then write the saved key/value pairs (handling
 * the suffixed multi-value buckets emitted by `extractFilterParams`).
 */
export function applyFilterParams(
  params: URLSearchParams,
  saved: Record<string, string>,
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of FILTER_KEYS) next.delete(key);

  // Group multi-value entries (key + key__1, key__2, …) so we can
  // call `append()` in order.
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
