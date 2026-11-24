import { capture, installInterceptor } from "@/utils/intercept";
import type { RequestLens } from "@/utils/intercept";
import { at, parseJsonValue } from "@/utils/json";

const GRAPHQL_HOST_RE = /(^|\.)api\.cosmos\.so$/i;
const SAVE_OP = "EditElementsConnectionsToClusters";

function isCosmosGraphql(url: string | undefined | null): boolean {
  if (!url) {
    return false;
  }
  try {
    const u = new URL(url, location.href);
    return GRAPHQL_HOST_RE.test(u.hostname) && u.pathname === "/graphql";
  } catch {
    return false;
  }
}

function opFromUrl(url: string): string | null {
  try {
    return new URL(url, location.href).searchParams.get("q");
  } catch {
    return null;
  }
}

export function inject(): void {
  const emitted = new Set<string>();

  function emitElement(id: string): void {
    if (!id || emitted.has(id)) {
      return;
    }
    emitted.add(id);
    capture(`https://www.cosmos.so/e/${id}`, "cosmos:save");
  }

  installInterceptor({
    id: "cosmos",
    match: (req: RequestLens) => isCosmosGraphql(req.url),
    async onResponse(req, res) {
      if (!res.ok || req.method !== "POST") {
        return;
      }
      const json = parseJsonValue(await res.readText());
      if (!json) {
        return;
      }
      const reqBody = parseJsonValue(await req.readBody());
      const opName = opFromUrl(req.url) ?? at(reqBody, "operationName");
      if (
        opName !== SAVE_OP ||
        !at(
          json,
          "data",
          "element",
          "editElementsConnectionsToClusters",
          "success",
        )
      ) {
        return;
      }
      const ids = at(reqBody, "variables", "elementIds");
      const adding = at(reqBody, "variables", "clusterIdsToConnect");
      if (
        !Array.isArray(ids) ||
        ids.length === 0 ||
        !Array.isArray(adding) ||
        adding.length === 0
      ) {
        return;
      }
      for (const id of ids) {
        emitElement(String(id));
      }
    },
  });
}
