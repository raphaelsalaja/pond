import { getAppRouter } from "@/shared/lib/app-router";

export type SearchPatch = Readonly<Record<string, unknown>>;

/** The latest location's search, which already reflects a write made earlier in the same tick. */
export function latestSearch(): Record<string, unknown> {
  return getAppRouter()?.latestLocation.search ?? {};
}

/** Applies `patch` to the latest location; an `undefined` value drops the key. */
export function hrefWithSearch(
  patch: SearchPatch,
  pathname?: string,
): string | null {
  const router = getAppRouter();
  if (!router) return null;
  const location = router.latestLocation;
  const search: Record<string, unknown> = { ...location.search };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete search[key];
    else search[key] = value;
  }
  return `${pathname ?? location.pathname}${router.options.stringifySearch(search)}`;
}

/** Writes through history directly so subscribers see the new location before this returns. */
export function writeSearch(
  patch: SearchPatch,
  options: { replace?: boolean } = {},
): void {
  const router = getAppRouter();
  const href = hrefWithSearch(patch);
  if (!router || !href || href === router.latestLocation.href) return;
  if (options.replace) router.history.replace(href);
  else router.history.push(href);
}
