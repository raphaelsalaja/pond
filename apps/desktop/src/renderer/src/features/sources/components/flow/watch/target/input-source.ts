import type { Source } from "@pond/schema/db";
import { hostToSource } from "@pond/schema/sources";
import { isWatchableSource, normalizeFeedUrl } from "@pond/schema/watches";

export function watchInputSource(
  input: string,
  selectedSource?: Source,
):
  | { type: "link"; source: Source }
  | { type: "unsupported" }
  | { type: "handle" } {
  const value = input.trim();
  if (selectedSource === "web") {
    return normalizeFeedUrl(value)
      ? { type: "link", source: "web" }
      : { type: "unsupported" };
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  if (hasScheme && !/^https?:\/\//i.test(value)) return { type: "unsupported" };
  const candidate = hasScheme ? value : `https://${value}`;
  const source = hostToSource(candidate);
  if (source && isWatchableSource(source)) {
    return { type: "link", source };
  }
  return hasScheme || value.startsWith("www.")
    ? { type: "unsupported" }
    : { type: "handle" };
}
