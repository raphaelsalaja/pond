import type { OpenWithApp } from "@/features/saves/lib/open-with-menu";
import type { Save, SaveFile } from "@/features/saves/types";

export interface BuildSaveMenuOptions {
  clipboardEmpty: boolean;
  fileIndex?: number | null;
  openWithApps?: readonly OpenWithApp[];
  opened?: boolean;
  folderId?: string | null;
  pinnedIds?: readonly string[];
  coverSaveId?: string | null;
  fontActivated?: boolean;
}

export interface SaveMenuContext {
  saves: readonly Save[];
  save: Save;
  ids: string[];
  batch: boolean;
  incomplete: boolean;
  clipboardEmpty: boolean;
  fileIndex: number | null;
  openWithApps: readonly OpenWithApp[];
  opened: boolean;
  resolvedFolderId: string | null;
  resolvedPinned: readonly string[];
  resolvedCover: string | null;
  inFolder: boolean;
  isPinned: boolean;
  isCover: boolean;
  hasFiles: boolean;
  hasTags: boolean;
  allTrashed: boolean;
  hasUrl: boolean;
  hasHttpUrl: boolean;
  targetFile: SaveFile | null;
  isGif: boolean;
  isWebp: boolean;
  isVideo: boolean;
  canDownloadVideo: boolean;
  canRemoveVideo: boolean;
  copyLabel: string;
  archivable: boolean;
  canResetThumbnail: boolean;
  canRename: boolean;
  canSplit: boolean;
  fontActivated: boolean;
}
