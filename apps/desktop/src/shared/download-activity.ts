import type { Op } from "@pond/schema/db";

export type DownloadPhase =
  | "starting"
  | "waiting"
  | "harvesting"
  | "capturing"
  | "requesting"
  | "receiving"
  | "processing"
  | "saving"
  | "finalizing"
  | "completed"
  | "failed";

export interface DownloadRequest {
  method: "GET";
  host: string;
  status?: number;
  contentType?: string;
  responseMs?: number;
  firstByteMs?: number;
}

export interface DownloadTransfer {
  transferId?: string;
  fileIndex: number;
  fileCount?: number;
  state: "requesting" | "receiving" | "completed" | "failed";
  startedAt: number;
  updatedAt: number;
  lastByteAt?: number;
  request?: DownloadRequest;
  receivedBytes?: number;
  totalBytes?: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
}

export interface DownloadActivity {
  taskId: string;
  saveId: string;
  op: Op;
  state: "running" | "completed" | "failed";
  startedAt: number;
  updatedAt: number;
  phase: DownloadPhase;
  phaseStartedAt: number;
  transfers: Array<DownloadTransfer>;
  timeline: Array<{ phase: DownloadPhase; at: number; fileIndex?: number }>;
}

export interface DownloadActivityUpdate {
  phase: DownloadPhase;
  transfer?: DownloadTransfer;
}

export type ReportDownloadActivity = (update: DownloadActivityUpdate) => void;
