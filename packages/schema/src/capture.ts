import { z } from "zod";

const WebUrl = z
  .url()
  .refine((value) => /^https?:\/\//i.test(value), "Use an HTTP or HTTPS URL.");
export const CaptureMetadataSchema = z.object({
  title: z.string().max(1000).optional(),
  notes: z.string().max(100_000).optional(),
  rating: z.number().int().min(0).max(5).optional(),
  tags: z.array(z.string().min(1).max(200)).max(200).default([]),
  folderIds: z.array(z.string().min(1)).max(200).default([]),
});
export const CaptureWebItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("asset"),
    url: WebUrl,
    title: z.string().max(1000).optional(),
  }),
  z.object({
    kind: z.literal("url"),
    url: WebUrl,
    title: z.string().max(1000).optional(),
  }),
  z.object({
    kind: z.literal("image"),
    dataUrl: z
      .string()
      .max(7_000_000)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
    title: z.string().max(1000).optional(),
  }),
]);
export const CaptureItemSchema = z.union([
  CaptureWebItemSchema,
  z.object({
    kind: z.literal("image"),
    dataUrl: z
      .string()
      .max(90_000_000)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
    title: z.string().max(1000).optional(),
  }),
  z.object({
    kind: z.literal("file"),
    path: z.string().min(1),
    title: z.string().max(1000).optional(),
  }),
  z.object({
    kind: z.literal("note"),
    text: z.string().min(1).max(100_000),
    title: z.string().max(1000).optional(),
  }),
]);
const DraftFields = {
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  originUrl: WebUrl.optional(),
  trigger: z.string().max(64).optional(),
  metadata: CaptureMetadataSchema.default({ tags: [], folderIds: [] }),
};
export const CaptureDraftSchema = z.object({
  ...DraftFields,
  items: z.array(CaptureItemSchema).min(1).max(500),
});
export const CaptureWebDraftSchema = z.object({
  ...DraftFields,
  items: z.array(CaptureWebItemSchema).min(1).max(500),
});
export type CaptureDraft = z.infer<typeof CaptureDraftSchema>;
export type CaptureWebDraft = z.infer<typeof CaptureWebDraftSchema>;
export type CaptureMetadata = z.infer<typeof CaptureMetadataSchema>;

export function parseCaptureTags(value: string): Array<string> {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 200);
}

export interface ElementRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function regionFromElement(
  rect: ElementRegion,
  viewport: { width: number; height: number },
) {
  const x = Math.min(viewport.width, Math.max(0, rect.x));
  const y = Math.min(viewport.height, Math.max(0, rect.y));
  const width = Math.min(viewport.width - x, Math.max(0, rect.width));
  const height = Math.min(viewport.height - y, Math.max(0, rect.height));
  if (width < 1 || height < 1) return null;
  return {
    x,
    y,
    width,
    height,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  };
}

export const CaptureReceiptSchema = z.object({
  id: z.string(),
  library: z.string(),
  state: z.enum(["accepted", "processing", "complete", "failed", "cancelled"]),
  completed: z.number(),
  total: z.number(),
  error: z.string().optional(),
  saveIds: z.array(z.string()),
  duplicateCount: z.number(),
  /** Set when the save exists but its tags, notes or folders didn't apply. */
  warning: z.string().optional(),
});
export type CaptureReceipt = z.infer<typeof CaptureReceiptSchema>;
