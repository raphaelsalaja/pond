import type { OpenWithApp } from "@/features/saves/lib/open-with-menu";
import type { Save, SaveFile } from "@/features/saves/types";

export interface BuildSaveMenuOptions {
  clipboardEmpty: boolean;
  fileIndex?: number | null;
  openWithApps?: ReadonlyArray<OpenWithApp>;
  opened?: boolean;
  folderId?: string | null;
  pinnedIds?: ReadonlyArray<string>;
  coverSaveId?: string | null;
  fontActivated?: boolean;
}

export interface SaveMenuContext {
  saves: ReadonlyArray<Save>;
  save: Save;
  ids: Array<string>;
  batch: boolean;
  incomplete: boolean;
  clipboardEmpty: boolean;
  fileIndex: number | null;
  openWithApps: ReadonlyArray<OpenWithApp>;
  opened: boolean;
  resolvedFolderId: string | null;
  resolvedPinned: ReadonlyArray<string>;
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
  canViewThumbnail: boolean;
  canRename: boolean;
  canGroup: boolean;
  canSplit: boolean;
  fontActivated: boolean;
}
