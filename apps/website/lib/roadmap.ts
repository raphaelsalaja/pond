import { readFile } from "node:fs/promises";
import path from "node:path";
import { GITHUB_URL } from "./links";

export type RoadmapSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string };

export interface RoadmapItem {
  title: string;
  body: RoadmapSegment[];
}

/** `next build` runs from `apps/website`; the roadmap lives at the repo root. */
const ROADMAP_FILE = path.join(process.cwd(), "../../ROADMAP.md");

const ITEM = /^- \*\*(.+?)\.\*\* (.+)$/;
const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

/** Repo-relative links in ROADMAP.md resolve against GitHub, since the site doesn't serve the docs. */
function resolve(href: string): string {
  return href.startsWith("http") ? href : `${GITHUB_URL}/blob/main/${href}`;
}

function segments(text: string): RoadmapSegment[] {
  const parts: RoadmapSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const [whole, label = "", href = ""] = match;
    if (match.index > last) {
      parts.push({ kind: "text", text: text.slice(last, match.index) });
    }
    parts.push({ kind: "link", text: label, href: resolve(href) });
    last = match.index + whole.length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

export async function getRoadmap(): Promise<RoadmapItem[]> {
  const source = await readFile(ROADMAP_FILE, "utf8");
  return source.split("\n").flatMap((line) => {
    const match = ITEM.exec(line.trim());
    if (!match) return [];
    const [, title = "", body = ""] = match;
    return [{ title, body: segments(body) }];
  });
}
