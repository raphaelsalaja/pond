import type { Source } from "@pond/schema/db";
import type { Capture } from "@pond/schema/raw";
import { hostToSource } from "@pond/schema/sources";

function isLinkedWebPage(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    if (protocol !== "http:" && protocol !== "https:") return false;
  } catch {
    return false;
  }
  return hostToSource(url) !== "arena";
}

/** The page an Are.na Link block points at, which its Save opens and archives instead of the block. */
export function arenaLinkUrl(
  capture: Pick<Capture, "source" | "url" | "extras">,
): string | null {
  if (capture.source !== "arena") return null;
  if (capture.extras?.blockClass?.toLowerCase() !== "link") return null;
  return isLinkedWebPage(capture.url) ? capture.url : null;
}

/** Are.na Link blocks keep Source `arena` so sync still knows the block, but behave like direct web Saves. */
export function isWebPageSave(save: { source: Source; url: string }): boolean {
  if (save.source === "web") return true;
  return save.source === "arena" && isLinkedWebPage(save.url);
}
