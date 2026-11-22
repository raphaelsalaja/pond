const HUES = [
  "red",
  "orange",
  "gold",
  "lime",
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "purple",
  "pink",
] as const;

/** Tags carry no color, so the dot hashes the lowercased name into the palette. */
export function tagDot(name: string): string {
  let hash = 0;
  for (const char of name.toLowerCase())
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `var(--ds-${HUES[Math.abs(hash) % HUES.length]})`;
}
