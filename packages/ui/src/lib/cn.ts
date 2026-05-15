export function cn(...classes: Array<unknown>): string {
  let out = "";
  for (const c of classes) {
    if (typeof c !== "string" || !c) continue;
    out = out ? `${out} ${c}` : c;
  }
  return out;
}
