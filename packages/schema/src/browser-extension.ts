import { z } from "zod";
import { SOURCES } from "./source-ids";
import type { Source } from "./source-ids";
import type { ExternalSource } from "./sources";

/** Sites where the browser extension can also save what you like or upvote, not only what you save. */
export const EXTENSION_LIKE_SOURCES = [
  "twitter",
  "instagram",
  "tiktok",
  "youtube",
  "reddit",
  "threads",
  "substack",
] as const satisfies ReadonlyArray<ExternalSource>;

const sourceFlags = z.partialRecord(z.enum(SOURCES), z.boolean()).catch({});

export const ExtensionSettingsSchema = z.object({
  enabled: sourceFlags,
  likes: sourceFlags,
  toolbar: z.enum(["popup", "save"]).catch("popup"),
  confirmations: z.boolean().catch(true),
  askDetails: z.boolean().catch(true),
  altClick: z.boolean().catch(true),
  screenshotFormat: z.enum(["png", "jpeg"]).catch("png"),
  retina: z.boolean().catch(true),
  theme: z.enum(["library", "system", "light", "dark"]).catch("library"),
});

export type ExtensionSettings = z.infer<typeof ExtensionSettingsSchema>;

/** Missing flags count as on, so a site added later starts out captured. */
export function sourceFlag(
  flags: ExtensionSettings["enabled"],
  source: Source,
): boolean {
  return flags[source] !== false;
}
