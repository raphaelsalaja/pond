/// <reference lib="dom" />

/** Runs in the page, so it must not close over anything outside itself. */
export function inPageTwitterSsr() {
  /**
   * x-web server-renders a post page and streams its GraphQL results into
   * the HTML as `kind:"Result.Ok",value:"<JSON as a JS string>"`, then
   * removes those scripts, so the page never requests them again.
   */
  function ssrResponseBodies(html: string): Array<string> {
    const out: Array<string> = [];
    const re = /kind:"Result\.Ok",value:"((?:[^"\\]|\\.)*)"/g;
    for (const m of html.matchAll(re)) {
      const literal = (m[1] ?? "")
        .replaceAll(/\\x([0-9a-fA-F]{2})/g, String.raw`\u00$1`)
        .replaceAll("\\'", "'");
      try {
        /** A quoted literal always parses to a string. */
        const body = String(JSON.parse(`"${literal}"`));
        if (body.startsWith("{")) {
          out.push(body);
        }
      } catch {}
    }
    return out;
  }

  return { ssrResponseBodies };
}
