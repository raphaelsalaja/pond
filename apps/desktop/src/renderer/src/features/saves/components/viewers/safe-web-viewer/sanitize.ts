const BLOCKED_ELEMENTS = [
  "script",
  "iframe",
  "object",
  "embed",
  "form",
  "base",
  "meta[http-equiv]",
].join(",");

const BLOCKED_ATTRIBUTES = new Set([
  "srcset",
  "ping",
  "formaction",
  "action",
  "target",
]);

const URL_ATTRIBUTES = new Set(["src", "href", "poster", "xlink:href"]);

function allowedOfflineUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("#")) return true;
  if (/^(data|pond):/i.test(trimmed)) return true;
  if (trimmed.startsWith("//")) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(trimmed);
}

export function sanitizeOfflineHtml(source: string): string {
  const document = new DOMParser().parseFromString(source, "text/html");
  document.querySelectorAll(BLOCKED_ELEMENTS).forEach((element) => {
    element.remove();
  });

  for (const element of document.querySelectorAll("*")) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (
        name.startsWith("on") ||
        BLOCKED_ATTRIBUTES.has(name) ||
        (URL_ATTRIBUTES.has(name) && !allowedOfflineUrl(attribute.value))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  const policy = document.createElement("meta");
  policy.setAttribute("http-equiv", "Content-Security-Policy");
  policy.setAttribute(
    "content",
    "default-src 'none'; img-src data: pond:; style-src 'unsafe-inline'; font-src data: pond:",
  );
  document.head.prepend(policy);
  return `<!doctype html>${document.documentElement.outerHTML}`;
}
