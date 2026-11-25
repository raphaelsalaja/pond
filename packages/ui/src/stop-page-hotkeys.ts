/** Keep typing keys from reaching document-level app shortcuts. */
export function stopPageHotkeys(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "stopPropagation">,
): void {
  if (event.metaKey || event.ctrlKey) return;
  if (event.key === "Escape") return;
  event.stopPropagation();
}
