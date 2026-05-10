/**
 * Concatenate class names, dropping anything falsy. Cheaper than
 * `[...].filter(Boolean).join(" ")` — no intermediate array allocation,
 * no closure over `Boolean`. The hot-path users are the per-card
 * primitives in `components/library` which run once per visible save.
 */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  let out = "";
  for (const c of classes) {
    if (!c) continue;
    out = out ? `${out} ${c}` : c;
  }
  return out;
}
