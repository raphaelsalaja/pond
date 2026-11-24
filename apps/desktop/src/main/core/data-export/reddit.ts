import { parseCsvRows } from "../../lib/csv";
import type { ExportEntry, ExportParser } from "./types";

function absolute(permalink: string): string | null {
  const value = permalink.trim();
  if (!value) {
    return null;
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return value.startsWith("/") ? `https://www.reddit.com${value}` : null;
}

export const redditParser: ExportParser = {
  id: "reddit",
  label: "Reddit",
  matches: (path) => /(^|\/)(saved_posts|post_votes)\.csv$/i.test(path),
  parse: (path, text) => {
    const [header, ...rows] = parseCsvRows(text);
    if (!header) {
      return [];
    }
    const at = (name: string) =>
      header.findIndex((cell) => cell.trim().toLowerCase() === name);
    const linkAt = at("permalink");
    const directionAt = at("direction");
    if (linkAt < 0) {
      return [];
    }
    const votes = /post_votes\.csv$/i.test(path);
    return rows.flatMap((row): Array<ExportEntry> => {
      if (votes && row[directionAt]?.trim().toLowerCase() !== "up") {
        return [];
      }
      const url = absolute(row[linkAt] ?? "");
      return url
        ? [{ url, listKind: votes ? "liked" : "saved", savedAt: null }]
        : [];
    });
  },
};
