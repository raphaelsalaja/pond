/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import { captureFromPageDom } from "../from-page";
import type { HarvestAdaptCtx } from "../from-page";
import { buildItemExpression } from "../lib/expression";
import { inPageUnsplashNormalize } from "./normalize";
import type { UnsplashAssetPage } from "./normalize";

export function buildExpression(assetId: string): string {
  return buildItemExpression(
    inPageUnsplashNormalize,
    inPageUnsplashHarvest,
    assetId,
  );
}

/** The photo page ships no app state, so the harvest asks `/napi` for the asset the page itself would load. */
async function inPageUnsplashHarvest(
  assetId: string,
  norm: ReturnType<typeof inPageUnsplashNormalize>,
): Promise<UnsplashAssetPage | null> {
  try {
    const res = await fetch(`/napi/photos/${encodeURIComponent(assetId)}`, {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (res.ok) {
      const asset = await norm.readAsset(res);
      if (asset) {
        return norm.assetPage(asset);
      }
    }
  } catch {
    /* fall through to the page's share tags */
  }
  const meta = (key: string): string =>
    document
      .querySelector(`meta[property="${key}"], meta[name="${key}"]`)
      ?.getAttribute("content")
      ?.trim() ?? "";
  const image = meta("og:image");
  const title = meta("og:title");
  if (!image && !title) return null;
  const page: UnsplashAssetPage = { mediaUrls: [], meta: {} };
  if (title) page.title = title;
  if (image) page.mediaUrls.push({ url: image, type: "image" });
  return page;
}

export function adapt(raw: JsonValue, ctx: HarvestAdaptCtx) {
  return captureFromPageDom(raw, ctx);
}
