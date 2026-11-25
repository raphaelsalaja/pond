import { parseCsvRows } from "../../lib/csv";
import type { ExportEntry, ExportParser } from "./types";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function playlistName(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file
    .replace(/\.csv$/i, "")
    .replace(/-videos$/i, "")
    .trim();
}

function takeoutDate(raw: string | undefined): Date | null {
  const text = raw?.trim();
  if (!text) return null;
  const parsed = Date.parse(text.replace(" UTC", "Z").replace(" ", "T"));
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

export const youtubeParser: ExportParser = {
  id: "youtube",
  label: "YouTube",
  matches: (path) =>
    /YouTube( and YouTube Music)?\/playlists\/[^/]+\.csv$/i.test(path),
  parse: (path, text) => {
    const rows = parseCsvRows(text);
    const headerAt = rows.findIndex((row) =>
      row.some((cell) => cell.trim() === "Video ID"),
    );
    const header = rows[headerAt];
    if (!header) return [];
    const idAt = header.findIndex((cell) => cell.trim() === "Video ID");
    const timeAt = header.findIndex((cell) => /time|timestamp/i.test(cell));
    const name = playlistName(path);
    const liked = /^liked videos$/i.test(name);
    return rows.slice(headerAt + 1).flatMap((row): Array<ExportEntry> => {
      const id = row[idAt]?.trim();
      if (!id || !VIDEO_ID.test(id)) return [];
      const entry: ExportEntry = {
        url: `https://www.youtube.com/watch?v=${id}`,
        listKind: liked ? "liked" : "saved",
        savedAt: takeoutDate(timeAt >= 0 ? row[timeAt] : undefined),
      };
      if (!liked) entry.folder = name;
      return [entry];
    });
  },
};
