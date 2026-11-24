import { z } from "zod";
import { RasterCompositionOptionsSchema } from "./conversion-contracts";

export const CombineImagesOptionsSchema = RasterCompositionOptionsSchema.extend(
  {
    direction: z.enum(["horizontal", "vertical"]).default("horizontal"),
    order: z.enum(["selection", "reverse"]).default("selection"),
    alignment: z.enum(["start", "center", "end", "stretch"]).default("stretch"),
    width: z.number().int().min(1).max(32_768).nullable().default(null),
    height: z.number().int().min(1).max(32_768).nullable().default(null),
    spacing: z.number().int().min(0).max(4096).default(0),
    margin: z.number().int().min(0).max(4096).default(0),
    radius: z.number().int().min(0).max(4096).default(0),
    canvasRadius: z.number().int().min(0).max(4096).default(0),
    background: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .default("#ffffff"),
    opacity: z.number().min(0).max(1).default(1),
    output: z.enum(["create", "export"]).default("create"),
    outputPath: z.string().min(1).nullable().default(null),
    deleteOriginals: z.boolean().default(false),
  },
);

export type CombineImagesOptions = z.infer<typeof CombineImagesOptionsSchema>;

export const COMBINE_IMAGES_WINDOW_IPC = {
  open: "pond:combine-images-window-open",
  load: "pond:combine-images-window-load",
  ready: "pond:combine-images-window-ready",
  close: "pond:combine-images-window-close",
  resolveDrop: "pond:combine-images-window-resolve-drop",
  zoom: "pond:combine-images-window-zoom",
} as const;

export const COMBINE_IMAGES_ZOOM_ACTIONS = [
  "view.zoom-in",
  "view.zoom-out",
  "view.zoom-reset",
] as const;
export type CombineImagesZoomAction =
  (typeof COMBINE_IMAGES_ZOOM_ACTIONS)[number];

export function isCombineImagesZoomAction(
  id: string,
): id is CombineImagesZoomAction {
  return COMBINE_IMAGES_ZOOM_ACTIONS.some((action) => action === id);
}

const SaveIdSchema = z.string().min(1).max(1024);

export const CombineImagesWindowOpenSchema = z.object({
  ids: z.array(SaveIdSchema).max(1000),
  folderId: SaveIdSchema.nullable(),
});
export type CombineImagesWindowOpen = z.infer<
  typeof CombineImagesWindowOpenSchema
>;

export const CombineImagesWindowLoadSchema =
  CombineImagesWindowOpenSchema.extend({
    nonce: z.number().int().nonnegative(),
  });
export type CombineImagesWindowLoad = z.infer<
  typeof CombineImagesWindowLoadSchema
>;

export const CombineImagesDropSchema = z.array(z.string().min(1)).max(1000);

export const COMBINE_IMAGES_QUERY_NAMES: ReadonlySet<string> = new Set([
  "saves.getMany",
  "saves.combineImages",
  "settings.getPrefs",
]);
