import type { EmptyInput, ReasonResult } from "./query-contracts-shared";

export interface ArenaLinkConversionProgress {
  processed: number;
  total: number;
  converted: number;
  failed: number;
}

export type ArenaLinkConversion = { ok: true } & ArenaLinkConversionProgress;

export interface ArenaLinkProgressEvent extends ArenaLinkConversionProgress {
  id: string;
}

export interface ArenaLinkQueryInputs {
  "arenaLinks.status": EmptyInput;
  "arenaLinks.convert": { progressId?: string };
}

export interface ArenaLinkQueryResults {
  "arenaLinks.status": { pending: number; running: boolean };
  "arenaLinks.convert": ReasonResult<
    "already_running",
    ArenaLinkConversionProgress
  >;
}
