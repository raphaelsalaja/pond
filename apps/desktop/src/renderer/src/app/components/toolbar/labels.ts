import { domainFromUrl } from "@pond/schema/domain";
import type { Save } from "@/features/saves/types";

export function saveLabel(save: Save | undefined): string | undefined {
  if (!save) {
    return undefined;
  }
  const title = save.title?.trim();
  if (title) {
    return title;
  }
  if (save.url) {
    return domainFromUrl(save.url) || save.url;
  }
  return "Untitled save";
}
