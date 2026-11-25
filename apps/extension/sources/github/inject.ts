import { GITHUB_REPO_PATTERN } from "@pond/schema/sources";
import { capture, installInterceptor } from "@/utils/intercept";

const STAR_PATH_RE = /^\/([^/]+\/[^/]+)\/star\/?$/;
const GRAPHQL_RE = /\/_graphql(?:\?|$)/;

/** The repo a star request names, from the form path or, for the GraphQL button, the page you're on. */
export function starredRepoUrl(
  requestUrl: string,
  body: string | null,
  pageUrl: string,
): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl, pageUrl);
  } catch {
    return null;
  }
  const fromPath = STAR_PATH_RE.exec(url.pathname)?.[1];
  if (fromPath) return `https://github.com/${fromPath}`;
  if (!GRAPHQL_RE.test(url.pathname)) return null;
  const text = `${url.search} ${body ?? ""}`;
  if (!/addStar/i.test(text)) return null;
  const [owner, name] = new URL(pageUrl).pathname.split("/").filter(Boolean);
  if (!owner || !name) return null;
  const candidate = `https://github.com/${owner}/${name}`;
  return GITHUB_REPO_PATTERN.test(candidate) ? candidate : null;
}

export function inject(): void {
  installInterceptor({
    id: "github",
    match: (req) =>
      req.method === "POST" &&
      (STAR_PATH_RE.test(pathOf(req.url)) || GRAPHQL_RE.test(req.url)),
    async onResponse(req, res) {
      if (!res.ok) return;
      const url = starredRepoUrl(req.url, await req.readBody(), location.href);
      if (url) capture(url, "github:star");
    },
  });
}

function pathOf(url: string): string {
  try {
    return new URL(url, location.href).pathname;
  } catch {
    return "";
  }
}
