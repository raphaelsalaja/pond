import { at, parseJsonValue } from "../../utils/json";

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const SAVE_OPERATIONS = new Set([
  "usePolarisSaveMediaSaveMutation",
  "PolarisAPISavePostMutation",
  "usePolarisMediaSaveToCollectionAddMediaMutation",
]);

const SAVE_ROOT_FIELDS = new Set([
  "xig_media_save",
  "xig_media_collection_add_media",
]);

type HeaderReader = (name: string) => string | null;

function formParams(bodyStr: string | null): URLSearchParams | null {
  if (!bodyStr) {
    return null;
  }
  try {
    return new URLSearchParams(bodyStr);
  } catch {
    return null;
  }
}

function friendlyName(
  getHeader: HeaderReader,
  bodyStr: string | null,
): string | null {
  return (
    getHeader("x-fb-friendly-name") ??
    formParams(bodyStr)?.get("fb_api_req_friendly_name") ??
    null
  );
}

export function mediaIdToShortcode(id: string): string | null {
  try {
    const mediaId = String(id).split("_", 1)[0];
    if (!mediaId) {
      return null;
    }
    let n = BigInt(mediaId);
    let s = "";
    while (n > 0n) {
      s = ALPHABET[Number(n & 63n)] + s;
      n = n >> 6n;
    }
    return s || null;
  } catch {
    return null;
  }
}

export function isSaveMutation(
  getHeader: HeaderReader,
  bodyStr: string | null,
): boolean {
  const name = friendlyName(getHeader, bodyStr);
  if (name && SAVE_OPERATIONS.has(name)) {
    return true;
  }
  if (name && /unsave|remove/i.test(name)) {
    return false;
  }
  const root = getHeader("x-root-field-name");
  if (root && !/unsave|remove/i.test(root)) {
    if (SAVE_ROOT_FIELDS.has(root) || root.endsWith("__save")) {
      return true;
    }
  }
  if (bodyStr) {
    for (const op of SAVE_OPERATIONS) {
      if (bodyStr.includes(op)) {
        return true;
      }
    }
    if (
      /xdt_api__v1__web__save__media_id__save(?!_unsave)/.test(bodyStr) &&
      !/unsave/i.test(bodyStr)
    ) {
      return true;
    }
  }
  return false;
}

export function isLikeRestUrl(url: string): boolean {
  if (/unlike/i.test(url)) {
    return false;
  }
  return /\/(?:web\/likes\/[^/]+\/like|api\/v1\/(?:web\/likes\/[^/]+\/like|media\/[^/]+\/like))\b/i.test(
    url,
  );
}

export function isLikeMutation(
  getHeader: HeaderReader,
  url: string,
  bodyStr: string | null,
): boolean {
  if (isLikeRestUrl(url)) {
    return true;
  }
  const friendly = friendlyName(getHeader, bodyStr) ?? "";
  if (/unlike/i.test(friendly)) {
    return false;
  }
  if (/like/i.test(friendly) && /mutation/i.test(friendly)) {
    return true;
  }
  const root = getHeader("x-root-field-name");
  if (root?.endsWith("__like") && !/unlike/i.test(root)) {
    return true;
  }
  if (bodyStr) {
    if (/Unlike/i.test(bodyStr) && /usePolarisLikeMediaUnlike/.test(bodyStr)) {
      return false;
    }
    if (bodyStr.includes("usePolarisLikeMediaLikeMutation")) {
      return true;
    }
    if (
      /use\w*Like\w*Mutation/.test(bodyStr) &&
      !/Unlike/i.test(bodyStr) &&
      !/Save|Bookmark/i.test(bodyStr)
    ) {
      return true;
    }
  }
  return false;
}

export function mediaIdFromLikeUrl(url: string): string | null {
  const m = url.match(/\/(?:likes|media)\/(\d+)(?:\/like)?\b/i);
  return m?.[1] ?? null;
}

export function extractMediaIdFromBody(bodyStr: string | null): string | null {
  const variablesRaw = formParams(bodyStr)?.get("variables");
  if (!variablesRaw) {
    return null;
  }
  const vars = parseJsonValue(variablesRaw);
  const candidate =
    at(vars, "input", "media_id") ??
    at(vars, "media_id") ??
    at(vars, "mediaId") ??
    at(vars, "media", "id") ??
    null;
  return candidate === null ? null : String(candidate);
}
