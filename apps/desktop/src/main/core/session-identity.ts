import type { Source } from "@pond/schema/db";
import { cosmosIdentityFromToken } from "../lib/cosmos-token";
import { redditIdentityFromToken } from "../lib/reddit-token";

interface NamedCookie {
  name: string;
  value: string;
}

export function identityKeyFromCookies(
  source: Source,
  cookies: Array<NamedCookie>,
): string | null {
  const get = (name: string): string | null => {
    const hit = cookies.find((c) => c.name === name);
    return hit && hit.value.length > 0 ? hit.value : null;
  };
  switch (source) {
    case "twitter": {
      /** twid looks like "u%3D783214" — url-encoded `u=<numeric user id>`. */
      const raw = get("twid");
      if (!raw) {
        return null;
      }
      const decoded = decodeURIComponent(raw);
      const m = decoded.match(/u=(\d+)/);
      return m?.[1] ?? decoded;
    }
    case "instagram":
    case "threads":
      return get("ds_user_id");
    case "reddit": {
      const token = get("token_v2");
      return token ? redditIdentityFromToken(token) : null;
    }
    case "cosmos": {
      const token = get("csms_accessToken");
      return token ? cosmosIdentityFromToken(token) : null;
    }
    case "tiktok":
      return get("uid_tt");
    case "github": {
      const login = get("dotcom_user");
      return login ? decodeURIComponent(login).toLowerCase() : null;
    }
    case "unsplash":
      return get("auth_user_id");
    default:
      return null;
  }
}
