import JSZip from "jszip";

export interface EpubCover {
  bytes: Uint8Array;
  mimeType: string;
}

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string;
}

function attribute(source: string, name: string): string {
  const match = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(
    source,
  );
  return decodeXml(match?.[2] ?? "");
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function tags(source: string, name: string): Array<string> {
  return Array.from(
    source.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "gi")),
    (match) => match[1] ?? "",
  );
}

function resolveArchivePath(basePath: string, relativePath: string): string {
  const parts =
    `${basePath.slice(0, basePath.lastIndexOf("/") + 1)}${relativePath}`
      .replaceAll("\\", "/")
      .split("/");
  const resolved: Array<string> = [];
  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  return resolved.join("/");
}

function imageMime(path: string, supplied: string): string {
  if (supplied.startsWith("image/")) {
    return supplied;
  }
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (extension === "png") {
    return "image/png";
  }
  if (extension === "gif") {
    return "image/gif";
  }
  if (extension === "webp") {
    return "image/webp";
  }
  if (extension === "svg") {
    return "image/svg+xml";
  }
  return "image/jpeg";
}

export async function extractEpubCover(
  source: ArrayBuffer | Uint8Array,
): Promise<EpubCover | null> {
  const zip = await JSZip.loadAsync(source);
  const container = zip.file("META-INF/container.xml");
  if (!container) {
    return null;
  }
  const containerXml = await container.async("text");
  const rootfile = tags(containerXml, "rootfile")[0];
  const packagePath = rootfile ? attribute(rootfile, "full-path") : "";
  const packageFile = packagePath ? zip.file(packagePath) : null;
  if (!packageFile) {
    return null;
  }

  const packageXml = await packageFile.async("text");
  const items: Array<ManifestItem> = tags(packageXml, "item").map((item) => ({
    id: attribute(item, "id"),
    href: attribute(item, "href"),
    mediaType: attribute(item, "media-type"),
    properties: attribute(item, "properties"),
  }));
  const coverId = tags(packageXml, "meta")
    .map((meta) => ({
      name: attribute(meta, "name").toLowerCase(),
      content: attribute(meta, "content"),
    }))
    .find((meta) => meta.name === "cover")?.content;
  const cover =
    items.find((item) =>
      item.properties.split(/\s+/).includes("cover-image"),
    ) ??
    items.find((item) => coverId && item.id === coverId) ??
    items.find(
      (item) =>
        item.mediaType.startsWith("image/") &&
        /(^|[._/-])cover([._/-]|$)/i.test(item.href),
    );
  if (!cover?.href) {
    return null;
  }
  const coverPath = resolveArchivePath(packagePath, cover.href);
  const coverFile = zip.file(coverPath);
  if (!coverFile) {
    return null;
  }
  return {
    bytes: await coverFile.async("uint8array"),
    mimeType: imageMime(coverPath, cover.mediaType),
  };
}
