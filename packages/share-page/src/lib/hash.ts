/** `#s3` opens that Save, so a link can point at one Save on the page. */
export function saveIdFromHash(
  hash: string,
  ids: ReadonlyArray<string>,
): string | null {
  const id = hash.replace(/^#/, "");
  return ids.includes(id) ? id : null;
}

export function replaceHash(
  location: Location,
  history: History,
  id: string | null,
): void {
  history.replaceState(
    null,
    "",
    id ? `#${id}` : `${location.pathname}${location.search}`,
  );
}
