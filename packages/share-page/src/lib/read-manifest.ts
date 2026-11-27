import {
  SHARE_PAGE_MANIFEST_ID,
  SharePageManifestSchema,
} from "@pond/schema/share-page";
import type { SharePageManifest } from "@pond/schema/share-page";

export type ManifestRead =
  | { ok: true; manifest: SharePageManifest }
  | { ok: false; error: string };

/** Reads the manifest from the JSON block in `index.html`. The page is the only input, so this is the viewer's I/O boundary. */
export function readManifest(document: Document): ManifestRead {
  const element = document.getElementById(SHARE_PAGE_MANIFEST_ID);
  if (!element?.textContent) {
    return { ok: false, error: "This page has no content." };
  }
  let json: unknown;
  try {
    json = JSON.parse(element.textContent);
  } catch {
    return { ok: false, error: "This page’s content is damaged." };
  }
  const parsed = SharePageManifestSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: "This page was made by a newer Pond, or it’s damaged.",
    };
  }
  return { ok: true, manifest: parsed.data };
}
