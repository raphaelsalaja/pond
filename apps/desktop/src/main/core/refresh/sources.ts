import type { Source } from "@pond/schema/db";

export function classifyUrl(rawUrl: string): {
  source: Source | null;
  authWalled: boolean;
} {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { source: null, authWalled: false };
  }
  const host = u.hostname.toLowerCase();

  if (host === "x.com" || host === "twitter.com" || host.endsWith(".x.com")) {
    return { source: "twitter", authWalled: true };
  }
  if (
    host === "instagram.com" ||
    host === "www.instagram.com" ||
    host.endsWith(".instagram.com")
  ) {
    return { source: "instagram", authWalled: true };
  }
  if (
    host === "pinterest.com" ||
    host.endsWith(".pinterest.com") ||
    host === "pin.it"
  ) {
    return { source: "pinterest", authWalled: false };
  }
  if (host === "are.na" || host === "www.are.na") {
    return { source: "arena", authWalled: false };
  }
  if (host === "cosmos.so" || host === "www.cosmos.so") {
    return { source: "cosmos", authWalled: true };
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    return { source: "tiktok", authWalled: true };
  }
  if (
    host === "youtube.com" ||
    host === "www.youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtu.be"
  ) {
    return { source: "youtube", authWalled: false };
  }
  return { source: null, authWalled: false };
}

export function homeUrlForSource(source: Source): string {
  switch (source) {
    case "twitter":
      return "https://x.com/login";
    case "instagram":
      return "https://www.instagram.com/accounts/login/";
    case "cosmos":
      return "https://www.cosmos.so/login";
    case "tiktok":
      return "https://www.tiktok.com/login";
    case "pinterest":
      return "https://www.pinterest.com/login/";
    case "arena":
      return "https://www.are.na/log-in";
    case "youtube":
      return "https://accounts.google.com/ServiceLogin?service=youtube";
  }
}

export function supportsYtDlp(source: Source | null): boolean {
  if (!source) return false;
  switch (source) {
    case "twitter":
    case "instagram":
    case "cosmos":
    case "tiktok":
    case "youtube":
      return true;
    case "pinterest":
    case "arena":
      return false;
  }
}

export function sourceLabel(source: Source): string {
  switch (source) {
    case "twitter":
      return "X / Twitter";
    case "instagram":
      return "Instagram";
    case "pinterest":
      return "Pinterest";
    case "arena":
      return "Are.na";
    case "cosmos":
      return "Cosmos";
    case "tiktok":
      return "TikTok";
    case "youtube":
      return "YouTube";
  }
}
