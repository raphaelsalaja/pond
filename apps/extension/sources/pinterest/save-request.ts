import { at, parseJsonValue } from "../../utils/json";
import type { JsonValue } from "../../utils/json";

function decodeDataParam(encoded: string): JsonValue | null {
  let decoded = encoded;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    /* already decoded */
  }
  return parseJsonValue(decoded) ?? parseJsonValue(encoded);
}

export function pinIdFromBody(body: string | null): string | null {
  if (!body) return null;
  let json: JsonValue | null = null;
  if (body.startsWith("data=")) {
    json = decodeDataParam(body.slice(5).split("&")[0] ?? "");
  } else if (body.includes("&data=")) {
    const m = body.match(/(?:^|&)data=([^&]+)/);
    if (m?.[1]) json = decodeDataParam(m[1]);
  } else if (body.startsWith("{")) {
    json = parseJsonValue(body);
  }
  if (!json) return null;
  const opts = at(json, "options") ?? at(json, "data", "options") ?? json;
  const id =
    at(opts, "pin_id") ??
    at(opts, "id") ??
    at(opts, "source_pin_id") ??
    at(opts, "sourceId");
  return id ? String(id) : null;
}
