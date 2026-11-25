const ALLOWED = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "br",
  "ul",
  "ol",
  "li",
  "p",
]);

function plainOf(value: string): string {
  return value
    .replaceAll(/<br\s*\/?>/gi, "\n")
    .replaceAll(/<\/(p|li)>/gi, "\n")
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

/** Keeps bold, italic, underline, and lists. Anything else comes back as plain text. */
export function richNote(value: string): string {
  const normalized = value
    .replaceAll(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replaceAll(/<div>/gi, "<br>")
    .replaceAll(/<\/div>/gi, "")
    .replace(/^(<br\s*\/?>)+/i, "");
  const clean = normalized.replaceAll(
    /<\/?([a-z0-9]+)(?:\s[^>]*)?\/?>/gi,
    (tag, name: string) => {
      const lower = name.toLowerCase();
      if (!ALLOWED.has(lower)) return "";
      if (lower === "br") return "<br>";
      return tag.startsWith("</") ? `</${lower}>` : `<${lower}>`;
    },
  );
  if (!/<(b|strong|i|em|u|ul|ol|li|p)\b/i.test(clean)) return plainOf(clean);
  return clean;
}

export function isRichNote(value: string): boolean {
  return /<(b|strong|i|em|u|ul|ol|li|p)\b/i.test(value);
}
