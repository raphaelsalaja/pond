/// <reference lib="dom" />

import type {
  CollectionFailureReason,
  CollectionsReply,
  CollectionsResult,
} from "../lib/collections-reply";
import { INSTAGRAM_HOME_URL } from "./list";

interface CollectionsPage {
  items?: Array<{
    collection_id?: string | number;
    collection_name?: string;
    collection_type?: string;
    collection_media_count?: number;
  }>;
  more_available?: boolean;
  next_max_id?: string | number;
  require_login?: boolean;
  message?: string;
  status?: string;
}

interface CollectionsConnection {
  edges?: Array<{
    node?: {
      __typename?: string;
      collection_id?: string | number;
      collection_name?: string;
      collection_media_count?: number;
    } | null;
  }>;
  page_info?: { end_cursor?: string | null; has_next_page?: boolean };
}

interface GraphqlReply {
  data?: {
    viewer?: Record<string, CollectionsConnection | undefined> | null;
  };
  errors?: Array<{ message?: string }>;
}

interface Attempt {
  host: string;
  ok: boolean;
  status: number;
  json: CollectionsPage | null;
  /** The content type, or the error when the request never got a reply. */
  note: string;
}

type QueryModule =
  | "PolarisProfileSavedTabContentQuery$Parameters"
  | "PolarisSavedCollectionPickerQuery$Parameters";

/** The web app's modules the listing reads; the main process re-parses everything they yield. */
interface PageModules {
  DTSGInitialData: { token?: string };
  PolarisConfig: {
    getViewerData_DO_NOT_USE?: () => { username?: string } | null;
  };
  PolarisProfileSavedTabContentQuery$Parameters: { params?: { id?: string } };
  PolarisSavedCollectionPickerQuery$Parameters: { params?: { id?: string } };
}

export function buildInstagramCollectionsExpression(): string {
  return `(async () => {
    try { return await (${inPageInstagramCollections.toString()})(); }
    catch (e) { return { ok: false, reason: 'unknown', detail: String((e && e.message) || e).slice(0, 200) }; }
  })()`;
}

function instagramSavedUrl(viewer: string): string {
  return `https://www.instagram.com/${encodeURIComponent(viewer)}/saved/`;
}

/** Your Saved page loads the web app's current query ids, so a run there outlasts the ids Pond ships with. */
export async function listInstagramCollections(
  readAt: (url: string) => Promise<CollectionsResult>,
): Promise<CollectionsResult> {
  const home = await readAt(INSTAGRAM_HOME_URL);
  if (home.ok || home.reason !== "unknown" || !home.viewer) return home;
  return readAt(instagramSavedUrl(home.viewer));
}

/** Lists the collections you made; the automatic "All posts" collection is the saved list itself. */
async function inPageInstagramCollections(): Promise<CollectionsReply> {
  const tried: string[] = [];
  const pageModule = <K extends keyof PageModules>(
    name: K,
  ): PageModules[K] | undefined => {
    try {
      return globalThis.require?.(name);
    } catch {
      return undefined;
    }
  };
  const clip = (part: string) => part.slice(0, 96);
  const viewer = (() => {
    try {
      const name =
        pageModule("PolarisConfig")?.getViewerData_DO_NOT_USE?.()?.username;
      return name && /^[A-Za-z0-9._]{1,30}$/.test(name) ? name : null;
    } catch {
      return null;
    }
  })();

  const graphql = await listViaGraphql();
  if (graphql) return graphql;
  const rest = await listViaRest();
  if (rest.ok) return rest;
  const reason =
    rest.reason === "unknown" && (await signedOut())
      ? "auth_required"
      : rest.reason;
  const failure: Extract<CollectionsReply, { ok: false }> = {
    ok: false,
    reason,
    detail: tried.join("; ").slice(0, 600),
  };
  if (viewer) failure.viewer = viewer;
  return failure;

  /** The web app lists collections through these persisted queries; Instagram retired the REST list for web sessions. */
  async function listViaGraphql(): Promise<CollectionsReply | null> {
    const dtsg =
      pageModule("DTSGInitialData")?.token ||
      (document.documentElement.innerHTML.match(
        /"DTSGInitialData",\[\],\{"token":"([^"]+)"/,
      )?.[1] ??
        "");
    const csrf =
      document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] ?? "";
    if (!dtsg || !csrf) {
      tried.push(`graphql no ${dtsg ? "csrftoken" : "fb_dtsg"}`);
      return null;
    }
    const queries: Array<{
      module: QueryModule;
      docId: string;
      field: string;
      variables: (after: string | null) => object;
    }> = [
      {
        module: "PolarisProfileSavedTabContentQuery$Parameters",
        docId: "27584326974521636",
        field: "collections_unified_with_auto_collections",
        variables: (after: string | null) => ({
          after,
          collection_types: ["MEDIA"],
          first: 50,
        }),
      },
      {
        module: "PolarisSavedCollectionPickerQuery$Parameters",
        docId: "29115677831365401",
        field: "media_collections",
        variables: (after: string | null) => ({ after, first: 50 }),
      },
    ];
    for (const query of queries) {
      const live = pageModule(query.module)?.params?.id;
      const docIds = live ? [live] : [];
      if (!docIds.includes(query.docId)) docIds.push(query.docId);
      for (const docId of docIds) {
        const listed = await walk(docId, query.field, query.variables);
        if (listed) return listed;
      }
    }
    return null;

    async function walk(
      docId: string,
      field: string,
      variables: (after: string | null) => object,
    ): Promise<CollectionsReply | null> {
      const collections: Array<{
        id: string;
        name: string;
        count: number | null;
      }> = [];
      let after: string | null = null;
      for (let page = 0; page < 20; page++) {
        let status = 0;
        let json: GraphqlReply | null = null;
        let note = "";
        try {
          const res = await fetch("/api/graphql", {
            method: "POST",
            credentials: "include",
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              "x-ig-app-id": "936619743392459",
              "x-csrftoken": csrf,
            },
            body: new URLSearchParams({
              doc_id: docId,
              variables: JSON.stringify(variables(after)),
              fb_dtsg: dtsg,
              server_timestamps: "true",
            }),
          });
          status = res.status;
          note = res.headers.get("content-type") ?? "";
          const text = await res.text();
          try {
            json = JSON.parse(text.replace(/^for \(;;\);/, ""));
          } catch {
            json = null;
          }
        } catch (e) {
          note = String(e);
        }
        const connection = json?.data?.viewer?.[field];
        if (!connection) {
          const why =
            json?.errors?.[0]?.message ??
            (json ? "no viewer" : note || "no reply");
          tried.push(clip(`graphql ${docId} ${status || ""} ${why}`));
          return null;
        }
        for (const edge of connection.edges ?? []) {
          const node = edge.node;
          if (!node || node.collection_id === undefined) continue;
          if (/Auto/.test(node.__typename ?? "")) continue;
          collections.push({
            id: String(node.collection_id),
            name: node.collection_name ?? "",
            count: node.collection_media_count ?? null,
          });
        }
        const next = connection.page_info;
        if (!next?.has_next_page || !next.end_cursor) break;
        after = next.end_cursor;
        await new Promise((r) => setTimeout(r, 250));
      }
      return { ok: true, collections };
    }
  }

  /** The REST list stays as a last resort; www and the API host refuse it in different ways, so both are tried. */
  async function listViaRest(): Promise<CollectionsReply> {
    const collections: Array<{
      id: string;
      name: string;
      count: number | null;
    }> = [];
    let cursor: string | null = null;
    let apiHost = false;
    const list = async (params: URLSearchParams): Promise<Attempt> => {
      const host = apiHost ? "i.instagram.com" : location.host;
      try {
        const res = await fetch(
          `${apiHost ? "https://i.instagram.com" : ""}/api/v1/collections/list/?${params}`,
          {
            credentials: "include",
            headers: {
              "x-ig-app-id": "936619743392459",
              "x-asbd-id": "129477",
              "x-requested-with": "XMLHttpRequest",
              accept: "*/*",
            },
          },
        );
        const json: CollectionsPage | null = await res.json().catch(() => null);
        const note = res.headers.get("content-type") ?? "";
        return { host, ok: res.ok, status: res.status, json, note };
      } catch (e) {
        return { host, ok: false, status: 0, json: null, note: String(e) };
      }
    };
    const verdict = (attempt: Attempt): CollectionFailureReason | null => {
      const message = attempt.json?.message ?? "";
      /** Instagram answers 400 with one of these until you clear the prompt on instagram.com. */
      if (/^(checkpoint|challenge|consent)_required$/.test(message)) {
        return "checkpoint";
      }
      if (
        attempt.status === 401 ||
        attempt.status === 403 ||
        attempt.json?.require_login ||
        message === "login_required"
      ) {
        return "auth_required";
      }
      if (attempt.status === 429) return "rate_limited";
      if (!attempt.ok || !attempt.json || attempt.json.status === "fail") {
        return "unknown";
      }
      return null;
    };
    const describe = (attempt: Attempt) =>
      clip(
        [
          attempt.host,
          attempt.status || "",
          attempt.json?.message || attempt.note,
        ]
          .filter(Boolean)
          .join(" "),
      );
    for (let page = 0; page < 20; page++) {
      const params = new URLSearchParams({
        collection_types: JSON.stringify(["MEDIA"]),
        include_public_only: "0",
      });
      if (cursor) params.set("max_id", cursor);
      let attempt = await list(params);
      let failure = verdict(attempt);
      if (failure === "unknown" && !apiHost) {
        tried.push(describe(attempt));
        apiHost = true;
        attempt = await list(params);
        failure = verdict(attempt);
      }
      const json = attempt.json;
      if (failure || !json) {
        tried.push(describe(attempt));
        return { ok: false, reason: failure ?? "unknown" };
      }
      for (const item of json.items ?? []) {
        if (item.collection_id === undefined) continue;
        if (item.collection_type && item.collection_type !== "MEDIA") continue;
        collections.push({
          id: String(item.collection_id),
          name: item.collection_name ?? "",
          count: item.collection_media_count ?? null,
        });
      }
      if (!json.more_available || json.next_max_id === undefined) break;
      cursor = String(json.next_max_id);
      await new Promise((r) => setTimeout(r, 250));
    }
    return { ok: true, collections };
  }

  /** Signed out, both collection endpoints answer like a server error; this one says `require_login`. */
  async function signedOut(): Promise<boolean> {
    try {
      const res = await fetch("/api/v1/accounts/current_user/?edit=true", {
        credentials: "include",
        headers: {
          "x-ig-app-id": "936619743392459",
          "x-requested-with": "XMLHttpRequest",
        },
      });
      if (res.status === 401 || res.status === 403) return true;
      const json: { require_login?: boolean } | null = await res
        .json()
        .catch(() => null);
      return json?.require_login === true;
    } catch {
      return false;
    }
  }
}
