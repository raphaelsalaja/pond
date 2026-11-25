export interface PageHistory {
  entries: Array<number>;
  cursor: number;
}

export function initialPageHistory(): PageHistory {
  return { entries: [0], cursor: 0 };
}

export function currentPageIndex(history: PageHistory): number {
  return history.entries[history.cursor] ?? 0;
}

export function visitPage(history: PageHistory, index: number): PageHistory {
  if (currentPageIndex(history) === index) return history;
  const entries = [...history.entries.slice(0, history.cursor + 1), index];
  return { entries, cursor: entries.length - 1 };
}

export function stepPage(history: PageHistory, delta: number): PageHistory {
  const cursor = history.cursor + delta;
  if (cursor < 0 || cursor >= history.entries.length) return history;
  return { ...history, cursor };
}

export function displayArchiveAddress(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.hostname.replace(/^www\./, "")}${path}${parsed.search}`;
  } catch {
    return url;
  }
}
