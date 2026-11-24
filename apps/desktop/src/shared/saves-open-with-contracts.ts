import type { CancellableResult, OkResult } from "./query-contracts-shared";

export interface SavesOpenWithQueryInputs {
  "saves.copyInternalLinks": { ids: Array<string> };
  "saves.copyPrompt": { ids: Array<string> };
  "saves.listOpenWith": {
    ids: Array<string>;
    fileIndex?: number;
    includeIcons?: boolean;
  };
  "saves.openWith": {
    ids: Array<string>;
    fileIndex?: number;
    application?: string;
  };
  "saves.quickLook": { id: string; fileIndex?: number };
}

export interface SavesOpenWithQueryResults {
  "saves.copyInternalLinks": OkResult;
  "saves.copyPrompt": OkResult;
  "saves.listOpenWith": {
    apps: Array<{
      name: string;
      path: string;
      icon: string | null;
      isDefault: boolean;
    }>;
  };
  "saves.openWith": CancellableResult;
  "saves.quickLook": OkResult;
}
