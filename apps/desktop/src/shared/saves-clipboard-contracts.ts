import type { OkResult } from "./query-contracts-shared";
import type { SaveFileResult, SavesFileInput } from "./saves-contracts-shared";

export interface SavesClipboardQueryInputs {
  "saves.copyImage": SavesFileInput;
  "saves.copyThumbnail": { id: string };
  "saves.copyBase64": SavesFileInput;
  "saves.copyFile": SavesFileInput;
  "saves.copyFiles": { files: Array<SavesFileInput> };
  "clipboard.writeText": { text: string };
}

export interface SavesClipboardQueryResults {
  "saves.copyImage": SaveFileResult;
  "saves.copyThumbnail": SaveFileResult;
  "saves.copyBase64": SaveFileResult;
  "saves.copyFile": SaveFileResult;
  "saves.copyFiles": SaveFileResult<{ copied: number }>;
  "clipboard.writeText": OkResult;
}
