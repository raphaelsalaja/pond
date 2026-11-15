import { z } from "zod";

export const CANVAS_COLORS = [
  "white",
  "gray",
  "yellow",
  "orange",
  "red",
  "pink",
  "purple",
  "blue",
  "green",
] as const;
export const CanvasColorSchema = z.enum(CANVAS_COLORS);
export type CanvasColor = z.infer<typeof CanvasColorSchema>;

export const CANVAS_SIDES = ["top", "right", "bottom", "left"] as const;
const CanvasSideSchema = z.enum(CANVAS_SIDES);
export type CanvasSide = z.infer<typeof CanvasSideSchema>;

const CANVAS_OUTLINES = [
  "rectangle",
  "rounded",
  "ellipse",
  "diamond",
  "triangle",
  "hexagon",
  "parallelogram",
  "trapezoid",
  "star",
  "cylinder",
  "speech",
  "document",
  "chevron",
] as const;
const CanvasOutlineSchema = z.enum(CANVAS_OUTLINES);
export type CanvasOutline = z.infer<typeof CanvasOutlineSchema>;

export const CANVAS_LINES = ["curved", "elbow", "straight"] as const;
const CanvasLineSchema = z.enum(CANVAS_LINES);
export type CanvasLine = z.infer<typeof CanvasLineSchema>;

export const CANVAS_CAPS = [
  "none",
  "arrow",
  "triangle",
  "circle",
  "diamond",
  "one",
  "many",
  "zero-one",
  "one-many",
  "zero-many",
] as const;
const CanvasCapSchema = z.enum(CANVAS_CAPS);
export type CanvasCap = z.infer<typeof CanvasCapSchema>;

export const CANVAS_TEXT_SIZES = [
  "small",
  "medium",
  "large",
  "extra-large",
  "huge",
] as const;
export type CanvasTextSize = (typeof CANVAS_TEXT_SIZES)[number];

export const CANVAS_FONTS = ["simple", "bookish", "technical"] as const;
export type CanvasFont = (typeof CANVAS_FONTS)[number];

export const CANVAS_ALIGNS = ["left", "center", "right"] as const;
export type CanvasAlign = (typeof CANVAS_ALIGNS)[number];

export const CANVAS_VALIGNS = ["top", "middle", "bottom"] as const;
export type CanvasValign = (typeof CANVAS_VALIGNS)[number];

export const CANVAS_FILLS = ["solid", "transparent", "none"] as const;
export type CanvasFill = (typeof CANVAS_FILLS)[number];

export const CANVAS_BORDERS = ["solid", "dashed", "none"] as const;
export type CanvasBorder = (typeof CANVAS_BORDERS)[number];

export const CANVAS_WEIGHTS = ["thin", "thick"] as const;
export type CanvasWeight = (typeof CANVAS_WEIGHTS)[number];

export const CANVAS_THEMES = ["light", "dark"] as const;
export type CanvasTheme = (typeof CANVAS_THEMES)[number];

export const CanvasCropSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine(
    (crop) => crop.x + crop.width <= 1.001 && crop.y + crop.height <= 1.001,
    {
      message: "Crop stays inside the image.",
    },
  );
export type CanvasCrop = z.infer<typeof CanvasCropSchema>;

/** Canvas IDs name files inside the Library, so they never contain path separators. */
export const CanvasIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const CoordinateSchema = z.number().min(-1_000_000).max(1_000_000);
const LengthSchema = z.number().min(1).max(20_000);
const TextSchema = z.string().max(20_000);

const frame = {
  id: CanvasIdSchema,
  x: CoordinateSchema,
  y: CoordinateSchema,
  width: LengthSchema,
  height: LengthSchema,
  locked: z.boolean().optional(),
  /** Items sharing a group ID select and move together. */
  group: CanvasIdSchema.optional(),
  /** Degrees clockwise. Omitted while the item is upright. */
  rotation: z.number().int().min(0).max(359).optional(),
};

const textStyle = {
  textSize: z.enum(CANVAS_TEXT_SIZES).optional(),
  font: z.enum(CANVAS_FONTS).optional(),
  align: z.enum(CANVAS_ALIGNS).optional(),
  valign: z.enum(CANVAS_VALIGNS).optional(),
  bold: z.boolean().optional(),
  strike: z.boolean().optional(),
};

export const CanvasItemSchema = z.discriminatedUnion("kind", [
  z.object({
    ...frame,
    kind: z.literal("save"),
    saveId: z.string().min(1).max(200),
    crop: CanvasCropSchema.optional(),
  }),
  z.object({
    ...frame,
    kind: z.literal("note"),
    text: TextSchema,
    color: CanvasColorSchema,
    ...textStyle,
  }),
  z.object({
    ...frame,
    kind: z.literal("text"),
    text: TextSchema,
    ...textStyle,
  }),
  z.object({
    ...frame,
    kind: z.literal("figure"),
    outline: CanvasOutlineSchema,
    text: TextSchema,
    color: CanvasColorSchema,
    flipX: z.boolean().optional(),
    flipY: z.boolean().optional(),
    fill: z.enum(CANVAS_FILLS).optional(),
    border: z.enum(CANVAS_BORDERS).optional(),
    ...textStyle,
  }),
  z.object({
    ...frame,
    kind: z.literal("section"),
    title: z.string().max(200),
    color: CanvasColorSchema,
  }),
  z.object({
    ...frame,
    kind: z.literal("table"),
    rows: z
      .array(z.array(z.string().max(2_000)).min(1).max(30))
      .min(1)
      .max(100),
    color: CanvasColorSchema,
    ...textStyle,
  }),
  z.object({
    ...frame,
    kind: z.literal("code"),
    text: TextSchema,
    language: z.string().max(40),
    theme: z.enum(CANVAS_THEMES).optional(),
  }),
  /** A mind-map topic; its branches are the connectors leaving its right side. */
  z.object({
    ...frame,
    kind: z.literal("topic"),
    text: TextSchema,
    color: CanvasColorSchema,
    ...textStyle,
  }),
  z.object({
    ...frame,
    kind: z.literal("drawing"),
    color: CanvasColorSchema,
    /** Highlighter ink draws translucent. Omitted strokes are the marker. */
    ink: z.enum(["pen", "highlight"]).optional(),
    size: z.number().min(1).max(48),
    points: z
      .array(
        z.tuple([CoordinateSchema, CoordinateSchema, z.number().min(0).max(1)]),
      )
      .min(1)
      .max(10_000),
  }),
]);
export type CanvasItem = z.infer<typeof CanvasItemSchema>;

export const CanvasConnectorSchema = z.object({
  id: CanvasIdSchema,
  from: CanvasIdSchema,
  to: CanvasIdSchema,
  fromSide: CanvasSideSchema,
  toSide: CanvasSideSchema,
  /** Style fields default so connectors written before they existed still load. */
  line: CanvasLineSchema.default("curved"),
  startArrow: z.boolean().default(false),
  endArrow: z.boolean().default(true),
  /** Caps win over the arrow flags, which stay written so older builds still draw arrows. */
  start: CanvasCapSchema.optional(),
  end: CanvasCapSchema.optional(),
  dashed: z.boolean().default(false),
  weight: z.enum(CANVAS_WEIGHTS).optional(),
  color: CanvasColorSchema.default("gray"),
  label: TextSchema.default(""),
});
export type CanvasConnector = z.infer<typeof CanvasConnectorSchema>;

export const CanvasViewportSchema = z.object({
  x: z.number().min(-10_000_000).max(10_000_000),
  y: z.number().min(-10_000_000).max(10_000_000),
  zoom: z.number().min(0.05).max(8),
});
export type CanvasViewport = z.infer<typeof CanvasViewportSchema>;

export const CANVAS_ITEM_LIMIT = 5_000;

/** Save grids stay roughly square, so a large folder doesn't land as one tall strip. */
export function saveGridColumns(count: number): number {
  return Math.max(4, Math.ceil(Math.sqrt(count)));
}

const contentFields = {
  viewport: CanvasViewportSchema,
  items: z.array(CanvasItemSchema).max(CANVAS_ITEM_LIMIT),
  connectors: z.array(CanvasConnectorSchema).max(10_000),
};

/** Canvas items on the system clipboard, so a copy pastes into any Canvas. */
export const CanvasClipSchema = z.object({
  items: contentFields.items,
  connectors: contentFields.connectors,
});

function checkReferences(
  content: { items: CanvasItem[]; connectors: CanvasConnector[] },
  context: z.RefinementCtx,
): void {
  const ids = new Set<string>();
  for (const item of content.items) {
    if (ids.has(item.id))
      context.addIssue({
        code: "custom",
        message: `Duplicate item ${item.id}`,
      });
    ids.add(item.id);
  }
  for (const connector of content.connectors) {
    if (!ids.has(connector.from) || !ids.has(connector.to))
      context.addIssue({
        code: "custom",
        message: `Connector ${connector.id} points at a missing item`,
      });
  }
}

export const CanvasContentSchema = z
  .object(contentFields)
  .superRefine(checkReferences);
export type CanvasContent = z.infer<typeof CanvasContentSchema>;
export type CanvasContentInput = z.input<typeof CanvasContentSchema>;

export const CanvasSchema = z
  .object({
    id: CanvasIdSchema,
    name: z.string().trim().min(1).max(200),
    createdAt: z.number(),
    updatedAt: z.number(),
    ...contentFields,
  })
  .superRefine(checkReferences);
export type Canvas = z.infer<typeof CanvasSchema>;

export interface CanvasSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  itemCount: number;
  saveIds: string[];
}

export interface CanvasQueryInputs {
  "canvases.list": Record<string, never>;
  "canvases.get": { id: string };
  "canvases.create": { name?: string; saveIds?: string[] };
  "canvases.rename": { id: string; name: string };
  "canvases.update": { id: string; content: CanvasContent };
  "canvases.addSaves": { id: string; saveIds: string[] };
  "canvases.delete": { id: string };
  "canvases.capture": { x: number; y: number; width: number; height: number };
  "canvases.export": {
    name: string;
    format: "png" | "pdf";
    png: Uint8Array;
    width: number;
    height: number;
  };
}

export interface CanvasQueryResults {
  "canvases.list": CanvasSummary[];
  "canvases.get": Canvas | null;
  "canvases.create": Canvas;
  "canvases.rename": { ok: true };
  "canvases.update": { ok: true; updatedAt: number };
  "canvases.addSaves": Canvas;
  "canvases.delete": { ok: true };
  "canvases.capture": Uint8Array;
  "canvases.export":
    | { ok: true; path: string }
    | { ok: false; reason: "cancelled" };
}
