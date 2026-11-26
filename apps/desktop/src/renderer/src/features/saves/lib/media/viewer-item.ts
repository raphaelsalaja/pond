import { posterIsCrossFile } from "@shared/poster-policy";
import {
  ARTICLE_KIND,
  isAuxiliaryKind,
  isPostRenderKind,
  isThumbnailKind,
  POST_RENDER_DARK_KIND,
  POST_RENDER_LIGHT_KIND,
  THUMBNAIL_DARK_KIND,
  THUMBNAIL_KIND,
} from "@shared/save-file-names";
import { buildPondUrl } from "@/features/saves/lib/media/url";
import { viewerCapabilityFor } from "@/features/saves/lib/media/viewer-capability";
import type { ViewerCapability } from "@/features/saves/lib/media/viewer-capability";
import type { Save } from "@/features/saves/types";
import type { ResolvedTheme } from "@/shared/hooks/use-resolved-theme";

export interface ViewerItem {
  key: string;
  fileIndex: number;
  url: string;
  capability: ViewerCapability;
  posterUrl?: string;
  /** Cross-file posters are covers, not frames; the viewer must not paint them as video frames. */
  posterIsCrossFile?: boolean;
}

interface ViewerItemOptions {
  theme?: ResolvedTheme;
}

export function buildViewerItems(
  save: Save,
  options: ViewerItemOptions = {},
): Array<ViewerItem> {
  const posters = save.files.filter((file) => file.kind === "poster");
  let videoIndex = 0;

  const originals = save.files.flatMap((file, fileIndex) => {
    if (isAuxiliaryKind(file.kind) || isPostRenderKind(file.kind)) return [];

    const capability = viewerCapabilityFor(file);
    const item: ViewerItem = {
      key: `${fileIndex}:${file.path}`,
      fileIndex,
      url: buildPondUrl(save.id, file),
      capability,
    };

    if (capability.surface === "temporal") {
      const poster = posters[videoIndex] ?? posters[0];
      videoIndex += 1;
      if (poster) {
        item.posterUrl = buildPondUrl(save.id, poster);
        if (posterIsCrossFile(poster, save.source)) {
          item.posterIsCrossFile = true;
        }
      }
    }

    return [item];
  });

  const articleIndex = save.files.findIndex(
    (file) => file.kind === ARTICLE_KIND,
  );
  const article = save.files[articleIndex];
  if (article) {
    return [
      {
        key: `${articleIndex}:${article.path}`,
        fileIndex: articleIndex,
        url: buildPondUrl(save.id, article),
        capability: viewerCapabilityFor(article),
      },
      ...originals,
    ];
  }

  if (originals.length > 0) return originals;

  const dark = options.theme === "dark";
  const preferredRenderKind = dark
    ? POST_RENDER_DARK_KIND
    : POST_RENDER_LIGHT_KIND;
  const preferredThumbnailKind = dark ? THUMBNAIL_DARK_KIND : THUMBNAIL_KIND;
  const presentable =
    save.files.find((file) => file.kind === preferredRenderKind) ??
    save.files.find(
      (file) =>
        file.kind === POST_RENDER_LIGHT_KIND ||
        file.kind === POST_RENDER_DARK_KIND,
    ) ??
    save.files.find((file) => file.kind === preferredThumbnailKind) ??
    save.files.find((file) => isThumbnailKind(file.kind)) ??
    posters[0];
  if (!presentable) return [];

  const fileIndex = save.files.indexOf(presentable);
  return [
    {
      key: `${fileIndex}:${presentable.path}`,
      fileIndex,
      url: buildPondUrl(save.id, presentable),
      capability: viewerCapabilityFor(presentable),
    },
  ];
}
