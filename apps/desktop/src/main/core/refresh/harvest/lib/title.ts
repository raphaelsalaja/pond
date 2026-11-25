const TITLE_CAP = 90;

export function pickTitle(
  fullText: string,
  fallback?: string | null,
): string | null {
  const firstLine = fullText.split(/\n+/)[0]?.trim();
  if (!firstLine) return fallback ?? null;
  if (firstLine.length <= TITLE_CAP) return firstLine;
  return `${firstLine.slice(0, TITLE_CAP - 1).trimEnd()}…`;
}
