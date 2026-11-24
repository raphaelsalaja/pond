import { IconCopy, IconFloppyDisk, IconImagePlus } from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import { createElement } from "react";
import {
  copyVideoFrame,
  saveVideoFrame,
  setVideoThumbnail,
} from "@/features/saves/lib/media/capture-frame";
import { buildSaveMenu } from "@/features/saves/lib/menu";
import type { OpenWithApp } from "@/features/saves/lib/menu";
import type { Save } from "@/features/saves/types";
import { shortcutGlyphs } from "@/shared/lib/shortcuts";

interface BuildViewerMenuOptions {
  clipboardEmpty: boolean;
  video: HTMLVideoElement | null;
  fileIndex: number | null;
  openWithApps?: Array<OpenWithApp>;
}

export function fileIndexFromSlide(
  slide: Element | null | undefined,
): number | null {
  if (!slide) {
    return null;
  }
  const raw = slide.getAttribute("data-file-index");
  if (raw === null || raw === "") {
    return null;
  }
  const idx = Number(raw);
  return Number.isFinite(idx) ? idx : null;
}

function adaptVideoItems(
  items: Array<MenuItemSpec>,
  save: Save,
  video: HTMLVideoElement,
): Array<MenuItemSpec> {
  return items.map((item): MenuItemSpec => {
    if ("id" in item && item.id === "copy-primary") {
      return {
        label: "Copy Current Frame",
        icon: createElement(IconCopy),
        shortcut: shortcutGlyphs("viewer.copy-frame"),
        onClick: () => void copyVideoFrame(video),
      };
    }
    if ("label" in item && item.label === "Set Thumbnail from File") {
      return {
        label: "Set Current Frame as Thumbnail",
        icon: createElement(IconImagePlus),
        onClick: () => void setVideoThumbnail(save.id, video),
      };
    }
    if (item.type !== "submenu" && item.type !== "group") {
      return item;
    }

    const nested = adaptVideoItems(item.items, save, video);
    return item.type === "submenu" && item.label === "Export"
      ? {
          ...item,
          items: [
            {
              label: "Save Current Frame",
              icon: createElement(IconFloppyDisk),
              shortcut: shortcutGlyphs("viewer.save-frame"),
              onClick: () => void saveVideoFrame(video),
            },
            ...nested,
          ],
        }
      : { ...item, items: nested };
  });
}

export function buildViewerMenu(
  save: Save,
  { clipboardEmpty, video, fileIndex, openWithApps }: BuildViewerMenuOptions,
): Array<MenuItemSpec> {
  const base = buildSaveMenu(save, {
    clipboardEmpty,
    fileIndex,
    openWithApps,
    opened: true,
  });
  if (!video?.videoWidth) {
    return base;
  }
  return adaptVideoItems(base, save, video);
}
