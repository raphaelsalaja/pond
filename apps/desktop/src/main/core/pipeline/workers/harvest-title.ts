/** A page read without scripts is often titled with only the site name ("Google Search") where the tab said "malaga - Google Search". */
export function keepsCurrentTitle(
  current: string | null | undefined,
  harvested: string | null | undefined,
): boolean {
  const kept = current?.trim().toLowerCase() ?? "";
  const next = harvested?.trim().toLowerCase() ?? "";
  return next.length > 0 && kept.length > next.length && kept.includes(next);
}
