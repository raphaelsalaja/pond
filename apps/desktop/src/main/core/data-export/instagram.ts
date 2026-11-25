import { descriptorFor } from "@pond/schema/sources";
import type { ExportEntry, ExportParser } from "./types";
import { exportDate, exportText, parseJsonText, walkJson } from "./walk";

const POST_PATTERNS = descriptorFor("instagram").urlPatterns;

export const instagramParser: ExportParser = {
  id: "instagram",
  label: "Instagram",
  matches: (path) =>
    /(^|\/)(saved_posts|saved_collections|liked_posts)\.json$/i.test(path),
  parse: (path, text) => {
    const root = parseJsonText(text);
    if (root === null) return [];
    const listKind = /liked_posts\.json$/i.test(path) ? "liked" : "saved";
    const out: Array<ExportEntry> = [];
    walkJson(root, (node) => {
      const href = exportText(node.href);
      if (!href || !POST_PATTERNS.some((pattern) => pattern.test(href))) return;
      out.push({ url: href, listKind, savedAt: exportDate(node.timestamp) });
    });
    return out;
  },
};
