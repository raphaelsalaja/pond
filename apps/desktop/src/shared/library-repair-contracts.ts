import { z } from "zod";

export const LibraryRepairKindSchema = z.enum([
  "thumbnails",
  "physical-file-names",
  "invalid-content",
  "save-metadata",
]);

export type LibraryRepairKind = z.infer<typeof LibraryRepairKindSchema>;

export interface LibraryRepairConfirmation {
  affectedSaves: number;
  createsBackups: boolean;
  canUndo: boolean;
  movesToTrash: boolean;
  rewritesMetadata: boolean;
  renamesFiles: boolean;
  regeneratesThumbnails: boolean;
}

export interface LibraryRepairIssue {
  id: string;
  kind: LibraryRepairKind;
  saveId: string;
  title: string | null;
  summary: string;
  detail: string;
}

export interface LibraryRepairPreview {
  token: string;
  expiresAt: number;
  issues: LibraryRepairIssue[];
  confirmation: LibraryRepairConfirmation;
}

export interface LibraryRepairResult {
  repaired: number;
  skipped: number;
  undoRecorded: boolean;
}

export interface LibraryRepairJob {
  id: string;
  phase: "preview" | "apply";
  kind: LibraryRepairKind;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  processed: number;
  total: number;
  preview?: LibraryRepairPreview;
  result?: LibraryRepairResult;
  error?: string;
}

export const LibraryRepairPreviewRequestSchema = z.object({
  kind: LibraryRepairKindSchema,
  saveIds: z
    .array(z.string().trim().min(1).max(500))
    .min(1)
    .max(5000)
    .optional(),
});

export const LibraryRepairApplyRequestSchema = z.object({
  token: z.string().min(1).max(500),
});

export const LibraryRepairJobRequestSchema = z.object({
  id: z.string().min(1).max(500),
});

export interface LibraryRepairQueryInputs {
  "libraryRepairs.preview": z.infer<typeof LibraryRepairPreviewRequestSchema>;
  "libraryRepairs.apply": z.infer<typeof LibraryRepairApplyRequestSchema>;
  "libraryRepairs.cancel": z.infer<typeof LibraryRepairJobRequestSchema>;
  "libraryRepairs.get": z.infer<typeof LibraryRepairJobRequestSchema>;
}

export interface LibraryRepairQueryResults {
  "libraryRepairs.preview": LibraryRepairJob;
  "libraryRepairs.apply": LibraryRepairJob;
  "libraryRepairs.cancel": LibraryRepairJob | null;
  "libraryRepairs.get": LibraryRepairJob | null;
}
