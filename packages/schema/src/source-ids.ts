import { EXTERNAL_SOURCE_IDS, SOURCE_DESCRIPTORS } from "./sources/registry";
export const SOURCES = [...EXTERNAL_SOURCE_IDS, "web", "local"] as const;
export type Source = (typeof SOURCES)[number];

const SOURCE_LABELS = new Map<string, string>(
  SOURCE_DESCRIPTORS.map((d) => [d.id, d.label]),
);
SOURCE_LABELS.set("web", "Web");
SOURCE_LABELS.set("local", "Local");

export function sourceLabel(source: Source): string {
  return SOURCE_LABELS.get(source) ?? source;
}

export function hostToSource(rawUrl: string): Source | null {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
  for (const descriptor of SOURCE_DESCRIPTORS) {
    for (const owned of descriptor.hosts) {
      if (host === owned || host.endsWith(`.${owned}`)) return descriptor.id;
    }
  }
  return null;
}
