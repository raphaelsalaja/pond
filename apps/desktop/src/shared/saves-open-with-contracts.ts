import type { CancellableResult, OkResult } from "./query-contracts-shared";

export interface SavesOpenWithQueryInputs {
  "saves.copyInternalLinks": { ids: string[] };
  "saves.copyPrompt": { ids: string[] };
  "saves.listOpenWith": {
    ids: string[];
    fileIndex?: number;
    includeIcons?: boolean;
  };
  "saves.openWith": {
    ids: string[];
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
