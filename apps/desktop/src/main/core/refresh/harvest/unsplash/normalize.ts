/// <reference lib="dom" />

import type {
  BrowserValidators,
  UnsplashAsset,
} from "../lib/browser-validation";
import type { ListEntry } from "../list-types";

export interface UnsplashAssetPage {
  title?: string;
  description?: string;
  author?: string;
  mediaUrls: Array<{ url: string; type: "image" }>;
  meta: {
    authorName?: string;
    authorAvatar?: string;
    authorUrl?: string;
    publishedAt?: string;
  };
}

/** Runs inside the page, so the list walk and the item harvest read one asset shape the same way. */
export function inPageUnsplashNormalize(validators: BrowserValidators) {
  async function readAsset(res: Response): Promise<UnsplashAsset | null> {
    const asset = validators.unsplashAsset.safeParse(await res.json());
    return asset.success ? asset.data : null;
  }

  function assetEntry(asset: UnsplashAsset): ListEntry {
    const entry: ListEntry = {
      sourceId: asset.id,
      url: `https://unsplash.com/photos/${asset.id}`,
      listKinds: ["saved"],
    };
    if (asset.alt_description) {
      entry.title = asset.alt_description;
    }
    if (asset.description) {
      entry.description = asset.description;
    }
    if (asset.user?.name) {
      entry.author = asset.user.name;
    }
    const media = asset.urls?.raw ?? asset.urls?.full;
    if (media) {
      entry.mediaUrl = media;
      entry.mediaUrls = [{ url: media, type: "image" }];
      entry.mediaType = "image";
    }
    return entry;
  }

  function assetPage(asset: UnsplashAsset): UnsplashAssetPage {
    const page: UnsplashAssetPage = { mediaUrls: [], meta: {} };
    const title = asset.description || asset.alt_description;
    if (title) {
      page.title = title;
    }
    if (asset.description) {
      page.description = asset.description;
    }
    const user = asset.user;
    if (user?.username) {
      page.author = `@${user.username}`;
    } else if (user?.name) {
      page.author = user.name;
    }
    const media = asset.urls?.raw ?? asset.urls?.full;
    if (media) {
      page.mediaUrls.push({ url: media, type: "image" });
    }
    if (user?.name) {
      page.meta.authorName = user.name;
    }
    if (user?.profile_image?.large) {
      page.meta.authorAvatar = user.profile_image.large;
    }
    if (user?.links?.html) {
      page.meta.authorUrl = user.links.html;
    }
    if (asset.created_at) {
      page.meta.publishedAt = asset.created_at;
    }
    return page;
  }

  return { readAsset, assetEntry, assetPage };
}
