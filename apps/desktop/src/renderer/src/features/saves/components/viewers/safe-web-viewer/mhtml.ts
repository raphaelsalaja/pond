export interface MhtmlPage {
  label: string;
  html: string;
}

interface MimePart {
  headers: Map<string, string>;
  body: string;
}

function headersFrom(value: string): Map<string, string> {
  const headers = new Map<string, string>();
  const unfolded = value.replaceAll(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 1) {
      continue;
    }
    headers.set(
      line.slice(0, separator).trim().toLowerCase(),
      line.slice(separator + 1).trim(),
    );
  }
  return headers;
}

function decodeQuotedPrintable(value: string): Uint8Array {
  const binary = value
    .replaceAll(/=\r?\n/g, "")
    .replaceAll(/=([0-9a-f]{2})/gi, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodePart(part: MimePart): Uint8Array {
  const transfer =
    part.headers.get("content-transfer-encoding")?.toLowerCase() ?? "";
  if (transfer === "base64") {
    const binary = atob(part.body.replaceAll(/\s/g, ""));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
  if (transfer === "quoted-printable") {
    return decodeQuotedPrintable(part.body);
  }
  return Uint8Array.from(part.body, (character) => character.charCodeAt(0));
}

function charset(part: MimePart): string {
  return (
    /charset="?([^";\s]+)/i.exec(part.headers.get("content-type") ?? "")?.[1] ??
    "utf8"
  );
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function parseParts(source: string): Array<MimePart> {
  const split = /\r?\n\r?\n/.exec(source);
  if (!split?.index) {
    return [];
  }
  const headers = headersFrom(source.slice(0, split.index));
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(
    headers.get("content-type") ?? "",
  )?.[1];
  if (!boundary) {
    return [];
  }
  return source
    .slice(split.index + split[0].length)
    .split(`--${boundary}`)
    .flatMap((raw) => {
      const value = raw.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
      if (!value || value === "--") {
        return [];
      }
      const separator = /\r?\n\r?\n/.exec(value);
      if (!separator?.index) {
        return [];
      }
      return [
        {
          headers: headersFrom(value.slice(0, separator.index)),
          body: value.slice(separator.index + separator[0].length),
        },
      ];
    });
}

export function parseMhtml(source: string): Array<MhtmlPage> {
  const parts = parseParts(source);
  const replacements = new Map<string, string>();
  for (const part of parts) {
    const type = part.headers.get("content-type")?.split(";", 1)[0]?.trim();
    const bytes = decodePart(part);
    const dataUrl = `data:${type || "application/octet-stream"};base64,${base64(bytes)}`;
    const location = part.headers.get("content-location");
    const id = part.headers.get("content-id")?.replaceAll(/[<>]/g, "");
    if (location) {
      replacements.set(location, dataUrl);
    }
    if (id) {
      replacements.set(`cid:${id}`, dataUrl);
    }
  }
  return parts.flatMap((part) => {
    const type = part.headers.get("content-type")?.toLowerCase() ?? "";
    if (!type.startsWith("text/html")) {
      return [];
    }
    let html = new TextDecoder(charset(part)).decode(decodePart(part));
    for (const [from, to] of replacements) {
      html = html.split(from).join(to);
    }
    return [
      {
        label: part.headers.get("content-location") ?? "Archived Page",
        html,
      },
    ];
  });
}
