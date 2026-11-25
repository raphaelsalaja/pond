import type { ListKind } from "@pond/schema/list-kinds";
import type { ExportEntry, ExportParser } from "./types";
import { exportDate, exportText, parseJsonText, walkJson } from "./walk";

const VIDEO_ID = /tiktokv?\.com\/(?:share\/video|@[^/]*\/video|video)\/(\d+)/i;

function listKindFor(keys: ReadonlyArray<string>): ListKind | null {
  const path = keys.join("/").toLowerCase();
  if (path.includes("favorite video")) return "saved";
  if (path.includes("like list")) return "liked";
  return null;
}

export const tiktokParser: ExportParser = {
  id: "tiktok",
  label: "TikTok",
  matches: (path) => /(^|\/)user_data(_tiktok)?\.json$/i.test(path),
  parse: (_path, text) => {
    const root = parseJsonText(text);
    if (root === null) {
      return [];
    }
    const out: Array<ExportEntry> = [];
    walkJson(root, (node, keys) => {
      const link = exportText(node.Link ?? node.link);
      if (!link) return;
      const id = VIDEO_ID.exec(link)?.[1];
      const listKind = listKindFor(keys);
      if (!id || !listKind) return;
      out.push({
        url: `https://www.tiktok.com/@/video/${id}`,
        listKind,
        savedAt: exportDate(node.Date ?? node.date),
      });
    });
    return out;
  },
};
