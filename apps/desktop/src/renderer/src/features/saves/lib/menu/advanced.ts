import { IconCopyId, IconFile, IconImage } from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import { clipEmbeddingVersion, embeddingDimensions } from "@shared/embeddings";
import { createElement } from "react";
import bingLogo from "@/assets/logos/reverse-search/bing.png";
import googleLensLogo from "@/assets/logos/reverse-search/google-lens.svg";
import sauceNaoLogo from "@/assets/logos/reverse-search/saucenao.png";
import tineyeLogo from "@/assets/logos/reverse-search/tineye.png";
import yandexLogo from "@/assets/logos/reverse-search/yandex.png";
import { copyId } from "@/features/saves/lib/actions";
import { setFontActivation } from "@/features/saves/lib/font-activation";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";
import {
  REVERSE_SEARCH_ENGINES,
  reverseImageSearch,
} from "@/features/saves/lib/reverse-image-search";
import {
  copyIdsForSelection,
  reverseImageSearchForSelection,
} from "@/features/saves/lib/selection";
import type { Save } from "@/features/saves/types";
import { shortcutGlyphs } from "@/shared/lib/shortcuts";
import { buildDetailItems } from "./details";
import { ExtensionField } from "./extension-field";
import { glyph, notifyCopy } from "./shared";
import type { SaveMenuContext } from "./types";

function reverseSearchLogo(
  key: (typeof REVERSE_SEARCH_ENGINES)[number]["key"],
): string | null {
  switch (key) {
    case "google-lens":
      return googleLensLogo;
    case "yandex":
      return yandexLogo;
    case "bing":
      return bingLogo;
    case "tineye":
      return tineyeLogo;
    case "saucenao":
      return sauceNaoLogo;
    case "baidu":
    case "sogou":
      return null;
  }
}

function combinableImageCount(items: readonly Save[]): number {
  return items.filter((item) =>
    item.files.some(
      (file) =>
        file.mimeType === "image/png" ||
        file.mimeType === "image/jpeg" ||
        file.mimeType === "image/jpg" ||
        /\.(png|jpe?g)$/i.test(file.path),
    ),
  ).length;
}

function hasCompatibleMediaEmbedding(save: Save): boolean {
  return (
    save.clipModel === clipEmbeddingVersion() &&
    save.clipEmbedding?.length === embeddingDimensions()
  );
}

export function buildReverseSearchItems({
  save,
  ids,
  batch,
  hasHttpUrl,
}: SaveMenuContext): MenuItemSpec[] {
  return [
    {
      label: "Find Similar Saves",
      icon: glyph(IconImage),
      hidden: batch || !hasCompatibleMediaEmbedding(save),
      onClick: () =>
        saveLibraryBridge.setVisualProbe({
          id: save.id,
          label: save.title?.trim() || "Selected Save",
        }),
    },
    ...REVERSE_SEARCH_ENGINES.map((engine): MenuItemSpec => {
      const logo = reverseSearchLogo(engine.key);
      return {
        label: engine.label,
        icon: logo
          ? createElement("img", {
              src: logo,
              alt: "",
              width: 16,
              height: 16,
              draggable: false,
            })
          : glyph(IconImage),
        hidden:
          "usesImageUrl" in engine && !engine.usesImageUrl
            ? false
            : !hasHttpUrl,
        keywords: engine.key === "saucenao" ? "sauce nao anime" : undefined,
        onClick: () => {
          if (batch) {
            void reverseImageSearchForSelection(ids, engine.key);
            return;
          }
          void reverseImageSearch(save, engine.key);
        },
      };
    }),
  ];
}

export interface SupplementalMenuItems {
  copy: MenuItemSpec[];
  details: ReturnType<typeof buildDetailItems>;
  file: MenuItemSpec[];
  more: MenuItemSpec[];
  organization: MenuItemSpec[];
}

export function buildSupplementalItems(
  context: SaveMenuContext,
  maintenanceItems: MenuItemSpec[],
): SupplementalMenuItems {
  const { save, saves, ids, batch, fontActivated } = context;
  const details = buildDetailItems(context);

  return {
    copy: [
      {
        label: "Copy Save ID",
        icon: glyph(IconCopyId),
        shortcut: shortcutGlyphs("save.copy-id"),
        onClick: () => {
          if (batch) {
            void copyIdsForSelection(ids).then(notifyCopy);
            return;
          }
          void copyId(save.id);
        },
      },
    ],
    details,
    organization: [
      {
        label: "Combine Images",
        icon: glyph(IconImage),
        hidden: combinableImageCount(saves) < 2,
        onClick: () => {
          const nav = saveLibraryBridge.getNav();
          void window.pond.openCombineImagesWindow({
            ids,
            folderId: nav.kind === "folder" ? nav.id : null,
          });
        },
      },
      ...details.organization,
    ],
    file: [
      {
        label: fontActivated ? "Deactivate Font" : "Activate Font",
        icon: glyph(IconFile),
        hidden: batch || save.mediaType !== "font",
        onClick: () => {
          void setFontActivation(save.id, !fontActivated);
        },
      },
      ...details.file,
    ],
    more: [
      ...maintenanceItems,
      { type: "separator" },
      {
        type: "submenu",
        label: "Change Extension",
        icon: glyph(IconFile),
        hidden: !saves.some((item) => item.files.length > 0),
        items: [
          {
            type: "custom",
            render: () => createElement(ExtensionField, { ids }),
          },
        ],
      },
    ],
  };
}
