import type { QueryHandlerMap } from "./params";
import { savesImportClipboardQueries } from "./saves-import-clipboard";
import { savesImportPersistenceQueries } from "./saves-import-persistence";
import { savesImportSourceQueries } from "./saves-import-sources";
import { savesImportTransferQueries } from "./saves-import-transfer";

export const savesImportQueries = {
  "saves.copyToLibrary": savesImportTransferQueries["saves.copyToLibrary"],
  "saves.importEaglePackage":
    savesImportTransferQueries["saves.importEaglePackage"],
  "saves.importPackage": savesImportTransferQueries["saves.importPackage"],
  "saves.pickImportPaths": savesImportTransferQueries["saves.pickImportPaths"],
  "saves.classifyUrl": savesImportSourceQueries["saves.classifyUrl"],
  "saves.importFiles": savesImportTransferQueries["saves.importFiles"],
  "saves.reviewImportDuplicates":
    savesImportTransferQueries["saves.reviewImportDuplicates"],
  "saves.setCustomThumbnail":
    savesImportPersistenceQueries["saves.setCustomThumbnail"],
  "saves.setThumbnailFromClipboard":
    savesImportPersistenceQueries["saves.setThumbnailFromClipboard"],
  "saves.setGifThumbnail":
    savesImportPersistenceQueries["saves.setGifThumbnail"],
  "saves.setImageThumbnail":
    savesImportPersistenceQueries["saves.setImageThumbnail"],
  "saves.loadSubtitles": savesImportPersistenceQueries["saves.loadSubtitles"],
  "saves.replaceFile": savesImportPersistenceQueries["saves.replaceFile"],
  "saves.removeCustomThumbnail":
    savesImportPersistenceQueries["saves.removeCustomThumbnail"],
  "saves.createManual": savesImportPersistenceQueries["saves.createManual"],
  "saves.listBlankDocuments":
    savesImportPersistenceQueries["saves.listBlankDocuments"],
  "saves.createBlankDocument":
    savesImportPersistenceQueries["saves.createBlankDocument"],
  "saves.combineImages": savesImportPersistenceQueries["saves.combineImages"],
  "saves.exportDotLottie":
    savesImportPersistenceQueries["saves.exportDotLottie"],
  "saves.pickEagleLibrary": savesImportSourceQueries["saves.pickEagleLibrary"],
  "saves.importEagleLibrary":
    savesImportSourceQueries["saves.importEagleLibrary"],
  "saves.importClipboard": savesImportClipboardQueries["saves.importClipboard"],
  "saves.startDrag": savesImportTransferQueries["saves.startDrag"],
  "saves.quickAdd": savesImportSourceQueries["saves.quickAdd"],
  "saves.importBookmarks": savesImportSourceQueries["saves.importBookmarks"],
  "saves.importMymind": savesImportSourceQueries["saves.importMymind"],
  "saves.importDataExport": savesImportSourceQueries["saves.importDataExport"],
  "saves.extractPageAssets":
    savesImportSourceQueries["saves.extractPageAssets"],
} satisfies QueryHandlerMap;
