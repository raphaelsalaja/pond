/**
 * A page read without scripts often has only the site's name as its title, like
 * "Google Search", while the browser tab already said "malaga - Google Search".
 * A harvested title that is only part of the current one would lose detail.
 */
export function keepsCurrentTitle(
  current: string | null | undefined,
  harvested: string | null | undefined,
): boolean {
  const kept = current?.trim().toLowerCase() ?? "";
  const next = harvested?.trim().toLowerCase() ?? "";
  return next.length > 0 && kept.length > next.length && kept.includes(next);
}
