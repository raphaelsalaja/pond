import { sourceLabel } from "@pond/schema";
import type { Save } from "@/features/saves/types";

export function saveLabel(save: Save): string {
  return (
    save.title?.trim() ||
    save.description?.trim() ||
    save.notes?.trim() ||
    save.url
  );
}

export function saveDetail(save: Save): string {
  return save.author?.trim() || sourceLabel(save.source);
}
