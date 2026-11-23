import type { RawJson } from "@pond/schema/raw";
import { z } from "zod";

export const SearchCardDataSchema = z.object({
  engine: z.string(),
  query: z.string(),
  iconUrl: z.string().optional(),
});

export type SearchCardData = z.infer<typeof SearchCardDataSchema>;

const StoredSearchSchema = z.object({
  engine: z.string().trim().min(1),
  query: z.string().trim().min(1),
});

/** The engine and query a search results Save was captured with, plus a favicon large enough for the card. */
export function searchCardFromSave(save: {
  url: string;
  rawJson: RawJson | null | undefined;
}): SearchCardData | null {
  const parsed = StoredSearchSchema.safeParse(
    save.rawJson?.capture?.extras?.search,
  );
  if (!parsed.success) return null;
  const card: SearchCardData = { ...parsed.data };
  try {
    const host = new URL(save.url).hostname;
    if (host) {
      card.iconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
    }
  } catch {}
  return card;
}
