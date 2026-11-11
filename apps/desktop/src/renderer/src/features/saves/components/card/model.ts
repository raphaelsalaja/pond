import type { IconComponent } from "@pond/icons/types";
import { useMemo } from "react";
import { useMediaPickOptions } from "@/features/saves/hooks/use-media-pick-options";
import {
  orientAspectRatio,
  orientedDimensions,
} from "@/features/saves/lib/image-orientation";
import {
  buildMediaUnits,
  deriveTypeKind,
  deriveTypeLabel,
  type MediaPickOptions,
  type MediaUnit,
  pickCardUnit,
  pickPrimaryFile,
} from "@/features/saves/lib/media/units";
import { pickSourceIconUrl } from "@/features/saves/lib/media/url";
import { getSourceLabel } from "@/features/saves/lib/source-labels";
import { displayTitleForSave } from "@/features/saves/lib/text";
import {
  aspectDimsFor,
  aspectFor,
  useAspectVersion,
} from "@/features/saves/state/aspect";
import {
  type DisplayPrefs,
  type ItemInfo,
  type ItemInfoField,
  useDisplayPrefs,
  useItemInfo,
} from "@/features/saves/state/display-prefs";
import {
  formatListDimension,
  formatListRating,
} from "@/features/saves/state/list-columns";
import type { Save, SaveFile } from "@/features/saves/types";
import { getSourceIcon, getSourceLogo } from "@/features/sources";
import { formatAbsolute, formatBytes } from "@/shared/lib/format";

type SourceIcon = IconComponent;
type TypeKind = ReturnType<typeof deriveTypeKind>;
const PAPER_ASPECT = 8.5 / 11;

export interface SaveCardOverlayModel {
  type: { label: string; kind: TypeKind } | null;
  source: {
    label: string;
    logo: string | null;
    icon: SourceIcon | null;
  } | null;
  fileCount: number | null;
}

export interface SaveCardModel {
  save: Save;
  unit: MediaUnit | null;
  primary: SaveFile | null;
  mediaUnits: MediaUnit[];
  pickOptions: MediaPickOptions;
  aspect: number;
  title: string | null;
  time: string | null;
  overlay: SaveCardOverlayModel;
}

function itemInfoLine(
  save: Save,
  field: ItemInfoField,
  primary: SaveFile | null,
): string | null {
  if (field === "dimensions") {
    return formatListDimension(
      save.width ?? primary?.width,
      save.height ?? primary?.height,
    );
  }
  if (field === "fileSize") {
    const bytes = save.fileSize ?? primary?.size;
    if (bytes == null || bytes <= 0) return "—";
    return formatBytes(bytes);
  }
  if (field === "tags") return save.tags.join(", ") || "—";
  if (field === "rating") return formatListRating(save.rating);
  if (field === "modified") return formatAbsolute(save.createdAt) || null;
  if (field === "published") return formatAbsolute(save.publishedAt) || "—";
  return formatAbsolute(save.savedAt) || null;
}

export function buildSaveCardModel(
  save: Save,
  pickOptions: MediaPickOptions,
  display: DisplayPrefs,
  aspect: number,
  itemInfo?: ItemInfo,
): SaveCardModel {
  const unit = pickCardUnit(save, pickOptions);
  const primary = pickPrimaryFile(save, pickOptions);
  const mediaUnits = buildMediaUnits(save, pickOptions);
  const typeKind = deriveTypeKind(primary, save);
  const dimensions = aspectDimsFor(save, pickOptions, unit);
  const oriented =
    dimensions.w && dimensions.h
      ? orientedDimensions(dimensions.w, dimensions.h, save.rotate)
      : null;
  const previewAspect = oriented
    ? oriented.width / oriented.height
    : orientAspectRatio(aspect, save.rotate);
  const typeLabel = display.type ? deriveTypeLabel(primary, save) : null;
  const showSource = display.source && save.source !== "local";
  const sourceLabel = showSource ? getSourceLabel(save.source) : null;
  const fileCount = display.fileCount ? mediaUnits.length : 0;

  return {
    save,
    unit,
    primary,
    mediaUnits,
    pickOptions,
    aspect:
      previewAspect === 1 && typeKind === "doc" ? PAPER_ASPECT : previewAspect,
    title: display.name ? displayTitleForSave(save) : null,
    time: itemInfo
      ? itemInfo.visible
        ? itemInfoLine(save, itemInfo.field, primary)
        : null
      : display.date
        ? formatAbsolute(save.savedAt) || null
        : null,
    overlay: {
      type: typeLabel ? { label: typeLabel, kind: typeKind } : null,
      source: sourceLabel
        ? {
            label: sourceLabel,
            logo:
              getSourceLogo(save.source) ??
              (save.source === "web" ? pickSourceIconUrl(save) : null),
            icon: getSourceIcon(save.source),
          }
        : null,
      fileCount: fileCount > 1 ? fileCount : null,
    },
  };
}

export function useSaveCardModel(
  save: Save,
  observeAspect: boolean,
): SaveCardModel {
  const pickOptions = useMediaPickOptions();
  const display = useDisplayPrefs();
  const itemInfo = useItemInfo();
  const aspectVersion = useAspectVersion(observeAspect);

  return useMemo(() => {
    void aspectVersion;
    return buildSaveCardModel(
      save,
      pickOptions,
      display,
      aspectFor(save, pickOptions),
      itemInfo,
    );
  }, [aspectVersion, display, itemInfo, pickOptions, save]);
}
