import { writeFile } from "node:fs/promises";
import { BrowserWindow, dialog } from "electron";
import { z } from "zod";
import {
  CanvasContentSchema,
  CanvasIdSchema,
} from "../../../shared/canvas-contracts";
import type { QueryResult } from "../../../shared/query-contracts";
import { canvasPdf } from "../../core/canvas-pdf";
import {
  addSavesToCanvas,
  createCanvas,
  deleteCanvas,
  listCanvases,
  readCanvas,
  renameCanvas,
  updateCanvas,
} from "../../core/canvases";
import { query } from "./params";

const Id = z.object({ id: CanvasIdSchema });
const SaveIds = z.array(z.string().min(1).max(200)).max(10_000);
const Length = z.number().positive().max(20_000);
const Rect = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: Length,
  height: Length,
});

const EXPORT_FILTERS = {
  png: { name: "PNG Image", extensions: ["png"] },
  pdf: { name: "PDF Document", extensions: ["pdf"] },
};

function fileNameOf(name: string): string {
  return name.replaceAll(/[/\\:*?"<>|]/g, "-").trim() || "Canvas";
}

export const canvasesQueries = {
  "canvases.list": query(z.object({}), () => listCanvases()),
  "canvases.get": query(Id, ({ id }) => readCanvas(id)),
  "canvases.create": query(
    z.object({
      name: z.string().max(200).optional(),
      saveIds: SaveIds.optional(),
    }),
    (input) => createCanvas(input),
  ),
  "canvases.rename": query(
    Id.extend({ name: z.string().max(200) }),
    ({ id, name }) => {
      renameCanvas(id, name);
      return { ok: true as const };
    },
  ),
  "canvases.update": query(
    Id.extend({ content: CanvasContentSchema }),
    ({ id, content }) => ({
      ok: true as const,
      updatedAt: updateCanvas(id, content),
    }),
  ),
  "canvases.addSaves": query(
    Id.extend({ saveIds: SaveIds.min(1) }),
    ({ id, saveIds }) => addSavesToCanvas(id, saveIds),
  ),
  "canvases.capture": query(Rect, async (rect, event) => {
    if (!event) throw new Error("Capturing a canvas needs its window.");
    const image = await event.sender.capturePage({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
    return Uint8Array.from(image.toPNG());
  }),
  "canvases.export": query(
    z.object({
      name: z.string().max(200),
      format: z.enum(["png", "pdf"]),
      png: z.instanceof(Uint8Array),
      width: Length,
      height: Length,
    }),
    async (input, event): Promise<QueryResult<"canvases.export">> => {
      const options = {
        title: "Export Canvas",
        defaultPath: `${fileNameOf(input.name)}.${input.format}`,
        buttonLabel: "Export",
        filters: [EXPORT_FILTERS[input.format]],
      };
      const owner = event ? BrowserWindow.fromWebContents(event.sender) : null;
      const picked = owner
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options);
      if (picked.canceled || !picked.filePath) {
        return { ok: false, reason: "cancelled" };
      }
      await writeFile(
        picked.filePath,
        input.format === "png"
          ? input.png
          : await canvasPdf(input.png, input.width, input.height),
      );
      return { ok: true, path: picked.filePath };
    },
  ),
  "canvases.delete": query(Id, ({ id }) => {
    deleteCanvas(id);
    return { ok: true as const };
  }),
};
