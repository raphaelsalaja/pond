export function prettifyType(t: string): string {
  const lower = t.toLowerCase();
  if (lower === "video") return "MP4";
  if (lower === "image") return "Image";
  if (lower === "web") return "Web";
  if (lower === "link") return "Link";
  return t.toUpperCase();
}

export function pickAuthorColor(name: string): string {
  const palette = [
    "#d6409f",
    "#3b82f6",
    "#22c55e",
    "#f59e0b",
    "#a855f7",
    "#ef4444",
    "#14b8a6",
    "#0ea5e9",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length] ?? "#3b82f6";
}
