import { z } from "zod";
import type { ShellHint } from "./shell-hint";

export const QUICK_CAPTURE_IPC = {
  ready: "pond:quick-capture-ready",
  present: "pond:quick-capture-present",
  pick: "pond:quick-capture-pick",
  submit: "pond:quick-capture-submit",
  dismiss: "pond:quick-capture-dismiss",
} as const;

export interface QuickCaptureFolder {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  sortOrder: number;
  icon?: string;
}

export interface QuickCaptureSnapshot {
  /** Read once when Quick Capture opens; Pond never watches the clipboard. */
  clipboard: string;
  folders: QuickCaptureFolder[];
  shell: ShellHint;
}

export const QuickCaptureSubmitSchema = z.object({
  text: z.string().max(100_000),
  paths: z.array(z.string().min(1)).max(500),
  title: z.string().max(1000).optional(),
  notes: z.string().max(100_000).optional(),
  folderId: z.string().min(1).nullable(),
});

export type QuickCaptureSubmit = z.infer<typeof QuickCaptureSubmitSchema>;

export interface QuickCaptureResult {
  count: number;
}
