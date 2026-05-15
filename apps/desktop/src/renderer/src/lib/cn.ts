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
