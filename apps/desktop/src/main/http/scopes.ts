import type { ApiTokenScope } from "@pond/schema/api";

export type RouteAccess = ApiTokenScope | "internal";

const PREFIX = "/api/v2";

const ROUTES: ReadonlyArray<
  readonly [method: "GET" | "POST", pattern: RegExp, access: ApiTokenScope]
> = [
  ["GET", /^\/library\/(info|tags|folders|views|sources)$/, "search"],
  ["POST", /^\/library\/(query|search)$/, "search"],
  ["GET", /^\/saves\/(get|info|text|thumb|file|related|status)$/, "search"],
  ["POST", /^\/saves\/get$/, "search"],
  ["GET", /^\/library\/conversion\/[^/]+$/, "export"],
  [
    "POST",
    /^\/library\/conversion\/(presets|start|compress|[^/]+\/cancel)$/,
    "export",
  ],
  ["POST", /^\/enqueue$/, "write"],
  [
    "POST",
    /^\/saves\/(tags|folders|trash|restore|note|rating|favorite)$/,
    "write",
  ],
];

/** Unlisted routes stay limited to the Local API Token, so new routes are private until they're added here. */
export function routeAccess(method: string, path: string): RouteAccess {
  if (!path.startsWith(`${PREFIX}/`)) return "internal";
  const route = path.slice(PREFIX.length);
  const verb = method === "HEAD" ? "GET" : method;
  for (const [routeMethod, pattern, access] of ROUTES) {
    if (routeMethod === verb && pattern.test(route)) return access;
  }
  return "internal";
}
