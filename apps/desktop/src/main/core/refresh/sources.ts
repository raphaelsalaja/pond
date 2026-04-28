import type { Source } from "@pond/schema/db";

/**
 * URL → known scraper source. Keep this in lock-step with the per-host
 * matchers in `apps/extension/entrypoints/*-inject.content.ts` so the
 * desktop refresh path picks the same scraper the browser extension
 * would have run.
 *
 * Returns `null` for URLs we don't have a dedicated scraper for — those
 * fall through to the generic `og:`/oEmbed reader in `og.ts`.
 */
export function classifyUrl(rawUrl: string): {
  source: Source | null;
  /** Loginful sites where a plain server-side fetch will fail. */
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

/**
 * Home URL we land the user on when they click "Connect <source>" so the
 * persistent partition picks up their auth cookies. Picked to surface a
 * login prompt without dumping them on a noisy feed.
 */
export function homeUrlForSource(source: Source): string {
  switch (source) {
    case "twitter":
      return "https://x.com/login";
    case "instagram":
      return "https://www.instagram.com/accounts/login/";
    case "cosmos":
      return "https://www.cosmos.so/auth";
    case "tiktok":
      return "https://www.tiktok.com/login";
    case "pinterest":
      return "https://www.pinterest.com/login/";
    case "arena":
      return "https://www.are.na/log-in";
    case "youtube":
      return "https://accounts.google.com/ServiceLogin?service=youtube";
    case "article":
      return "about:blank";
  }
}

/**
 * Whether the per-source allowlist marks this site as something
 * yt-dlp can plausibly extract video from. Pinterest video pins and
 * Are.na video blocks are technically supported by yt-dlp upstream
 * but are off here until we've validated them; flip to `true` to
 * opt them in.
 *
 * Used by `refresh/index.ts` after the harvester returns: we only
 * spawn yt-dlp when the source supports it AND the harvest reported
 * a video. Cuts the spawn budget for the common photo-tweet case to
 * zero.
 */
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
    case "article":
      return false;
  }
}

/**
 * Human-friendly source label. Mirrors the badge text in the renderer's
 * sidebar so settings + per-card chrome match.
 */
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
    case "article":
      return "Article";
  }
}
