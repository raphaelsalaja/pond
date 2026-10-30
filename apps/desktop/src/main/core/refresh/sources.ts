import type { Source } from "@pond/schema/db";
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
      return "https://www.are.na/login";
    case "youtube":
      return "https://accounts.google.com/ServiceLogin?service=youtube";
    case "reddit":
      return "https://www.reddit.com/login/";
    case "threads":
      return "https://www.threads.com/login";
    case "github":
      return "https://github.com/login";
    case "substack":
      return "https://substack.com/sign-in";
    case "tumblr":
      return "https://www.tumblr.com/login";
    case "savee":
      return "https://savee.com/login/";
    case "behance":
      return "https://www.behance.net/";
    case "vimeo":
      return "https://vimeo.com/log_in";
    case "dribbble":
      return "https://dribbble.com/session/new";
    case "unsplash":
      return "https://unsplash.com/login";
    case "bluesky":
      return "";
    case "marked":
      return "https://marked.dev/explore";
    case "web":
      return "";
    case "local":
      return "";
  }
}
