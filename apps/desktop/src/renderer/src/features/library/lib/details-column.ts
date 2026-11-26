import type { ShellDetails } from "@/shared/lib/route-meta";

/**
 * Which panel the Details column shows. A Save opened over the current route takes the column, even
 * on a page that offers its own (the Fish page), so opening a Save from the chat shows that Save.
 * A page with no Details column stays without one.
 */
export function detailsColumn(
  details: ShellDetails | null,
  saveOpen: boolean,
): ShellDetails | null {
  if (details === null) return null;
  return saveOpen ? "save" : details;
}
