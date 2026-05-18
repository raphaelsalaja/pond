import type { Source } from "@pond/schema/db";

const HOST_LABELS: Record<Source, string> = {
  twitter: "Twitter",
  instagram: "Instagram",
  pinterest: "Pinterest",
  arena: "Are.na",
  cosmos: "Cosmos",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export function sourceLabel(source: Source): string {
  return HOST_LABELS[source];
}

export function cookieDomainForSource(source: Source): string | null {
  switch (source) {
    case "twitter":
      return ".x.com";
    case "instagram":
      return ".instagram.com";
    case "tiktok":
      return ".tiktok.com";
    case "pinterest":
      return ".pinterest.com";
    case "youtube":
      return ".youtube.com";
    case "cosmos":
      return ".cosmos.so";
    case "arena":
      return ".are.na";
  }
}

export function hostToSource(rawUrl: string): Source | null {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
  if (host === "x.com" || host === "twitter.com") return "twitter";
  if (host === "instagram.com") return "instagram";
  if (host === "pinterest.com" || host.endsWith(".pinterest.com")) {
    return "pinterest";
  }
  if (host === "are.na") return "arena";
  if (host === "cosmos.so") return "cosmos";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtu.be"
  ) {
    return "youtube";
  }
  return null;
}
