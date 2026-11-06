import { runInNewContext } from "node:vm";
import type { JsonObject } from "@pond/schema/json";
import { describe, expect, it, vi } from "vitest";
import {
  type CollectionsReply,
  type CollectionsResult,
  readCollectionsReply,
} from "../lib/collections-reply";
import {
  buildInstagramCollectionsExpression,
  listInstagramCollections,
} from "./collections";

interface Reply {
  status: number;
  /** Absent when Instagram answers with an HTML page. */
  body?: JsonObject;
}

interface Request {
  url: string;
  method: string;
  form: URLSearchParams | null;
  headers: Record<string, string>;
}

interface Modules {
  DTSGInitialData?: { token: string };
  PolarisConfig?: { getViewerData_DO_NOT_USE: () => { username: string } };
  PolarisProfileSavedTabContentQuery$Parameters?: { params: { id: string } };
}

interface Page {
  modules?: Modules;
  cookie?: string;
  html?: string;
}

const TAB_DOC = "27584326974521636";
const PICKER_DOC = "29115677831365401";

const SIGNED_IN: Page = {
  modules: {
    DTSGInitialData: { token: "dtsg-token" },
    PolarisConfig: {
      getViewerData_DO_NOT_USE: () => ({ username: "oluwa.rafa" }),
    },
  },
  cookie: "ds_user_id=1; csrftoken=csrf-token; ig_nrcb=1",
};

/** What the web app's Saved tab gets back from its collections query. */
function savedTab(
  nodes: JsonObject[],
  page: { end_cursor?: string; has_next_page?: boolean } = {},
): Reply {
  return {
    status: 200,
    body: {
      data: {
        viewer: {
          collections_unified_with_auto_collections: {
            edges: nodes.map((node) => ({ node, cursor: "c" })),
            page_info: { end_cursor: null, has_next_page: false, ...page },
          },
        },
      },
      extensions: { is_final: true },
    },
  };
}

const RECIPES_NODE = {
  __typename: "MediaCollection",
  collection_id: "17",
  collection_name: "Recipes",
  collection_media_count: 4,
};

const LISTED = {
  ok: true,
  collections: [{ id: "17", name: "Recipes", count: 4 }],
};

const STALE_DOC: Reply = {
  status: 200,
  body: {
    errors: [{ message: "The GraphQL document with ID 1 was not found." }],
  },
};

const REST_RECIPES: Reply = {
  status: 200,
  body: {
    items: [
      {
        collection_id: 17,
        collection_name: "Recipes",
        collection_type: "MEDIA",
        collection_media_count: 4,
      },
      { collection_id: 1, collection_type: "ALL_MEDIA_AUTO_COLLECTION" },
    ],
    more_available: false,
  },
};

const NOT_FOUND_PAGE: Reply = { status: 404 };

const SOFT_FAIL_EN: Reply = {
  status: 200,
  body: {
    message: "We're sorry, but something went wrong. Please try again.",
    status: "fail",
  },
};

/** What Instagram sent the French-locale report on issue #194. */
const SOFT_FAIL_FR: Reply = {
  status: 200,
  body: {
    message: "Une erreur s’est produite. Veuillez réessayer.",
    status: "fail",
  },
};

/** What www answers a signed-in session that isn't asking for JSON. */
const SIGNED_IN_USER: Reply = { status: 200 };

const isGraphql = (r: Request) => r.url === "/api/graphql";
const isRestList = (r: Request) => r.url.includes("/collections/list/");
const isCurrentUser = (r: Request) => r.url.includes("/current_user/");
const onApiHost = (r: Request) => r.url.startsWith("https://i.instagram.com/");

async function run(
  respond: (request: Request) => Reply | Error,
  page: Page = SIGNED_IN,
): Promise<{ result: CollectionsReply; requests: Request[] }> {
  const requests: Request[] = [];
  const modules = new Map(Object.entries(page.modules ?? {}));
  const result = await runInNewContext(buildInstagramCollectionsExpression(), {
    URLSearchParams,
    JSON,
    location: { host: "www.instagram.com" },
    document: {
      cookie: page.cookie ?? "",
      documentElement: { innerHTML: page.html ?? "<html></html>" },
    },
    require: (name: string) => {
      if (!modules.has(name))
        throw new Error(`Requiring unknown module "${name}"`);
      return modules.get(name);
    },
    setTimeout: (fn: () => void) => setTimeout(fn, 0),
    fetch: async (
      url: string,
      init: {
        method?: string;
        body?: URLSearchParams;
        headers?: Record<string, string>;
      } = {},
    ) => {
      const request: Request = {
        url,
        method: init.method ?? "GET",
        form: init.body ? new URLSearchParams(init.body.toString()) : null,
        headers: init.headers ?? {},
      };
      requests.push(request);
      const reply = respond(request);
      if (reply instanceof Error) throw reply;
      const { status, body } = reply;
      const text = body ? JSON.stringify(body) : "<!DOCTYPE html><html></html>";
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: {
          get: () => (body ? "application/json" : 'text/html; charset="utf-8"'),
        },
        text: async () => text,
        json: async () => {
          if (!body) throw new SyntaxError("not json");
          return body;
        },
      };
    },
  });
  return { result, requests };
}

/** GraphQL refuses every query, so the listing falls through to the REST list. */
function restOnly(rest: (request: Request) => Reply | Error) {
  return (request: Request) => {
    if (isGraphql(request)) return STALE_DOC;
    if (isCurrentUser(request)) return SIGNED_IN_USER;
    return rest(request);
  };
}

const STALE_TRAIL = `graphql ${TAB_DOC} 200 The GraphQL document with ID 1 was not found.; graphql ${PICKER_DOC} 200 The GraphQL document with ID 1 was not found.`;

describe("buildInstagramCollectionsExpression over GraphQL", () => {
  it("lists your collections with the Saved tab's query", async () => {
    const { result, requests } = await run(() =>
      savedTab([
        RECIPES_NODE,
        { __typename: "IGAllMediaAutoCollection", collection_id: "1" },
      ]),
    );
    expect(result).toEqual(LISTED);
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe("/api/graphql");
    expect(request?.headers["x-csrftoken"]).toBe("csrf-token");
    expect(request?.form?.get("fb_dtsg")).toBe("dtsg-token");
    expect(request?.form?.get("doc_id")).toBe(TAB_DOC);
    expect(JSON.parse(request?.form?.get("variables") ?? "")).toEqual({
      after: null,
      collection_types: ["MEDIA"],
      first: 50,
    });
  });

  it("pages through with the end cursor", async () => {
    const { result, requests } = await run((request) => {
      const { after } = JSON.parse(request.form?.get("variables") ?? "{}");
      return after === "next"
        ? savedTab([{ collection_id: "18", collection_name: "Trips" }])
        : savedTab([RECIPES_NODE], { end_cursor: "next", has_next_page: true });
    });
    expect(result).toEqual({
      ok: true,
      collections: [
        { id: "17", name: "Recipes", count: 4 },
        { id: "18", name: "Trips", count: null },
      ],
    });
    expect(requests).toHaveLength(2);
  });

  it("treats an account with no collections as an empty list", async () => {
    const { result } = await run(() => savedTab([]));
    expect(result).toEqual({ ok: true, collections: [] });
  });

  it("uses the query id the page has loaded before the one Pond ships with", async () => {
    const { result, requests } = await run(
      (request) =>
        request.form?.get("doc_id") === "live-tab"
          ? savedTab([RECIPES_NODE])
          : STALE_DOC,
      {
        ...SIGNED_IN,
        modules: {
          ...SIGNED_IN.modules,
          PolarisProfileSavedTabContentQuery$Parameters: {
            params: { id: "live-tab" },
          },
        },
      },
    );
    expect(result).toEqual(LISTED);
    expect(requests.map((r) => r.form?.get("doc_id"))).toEqual(["live-tab"]);
  });

  it("falls back to the shipped id when the page's id is stale", async () => {
    const { result, requests } = await run(
      (request) =>
        request.form?.get("doc_id") === TAB_DOC
          ? savedTab([RECIPES_NODE])
          : STALE_DOC,
      {
        ...SIGNED_IN,
        modules: {
          ...SIGNED_IN.modules,
          PolarisProfileSavedTabContentQuery$Parameters: {
            params: { id: "old-tab" },
          },
        },
      },
    );
    expect(result).toEqual(LISTED);
    expect(requests.map((r) => r.form?.get("doc_id"))).toEqual([
      "old-tab",
      TAB_DOC,
    ]);
  });

  it("falls back to the collection picker's query", async () => {
    const { result, requests } = await run((request) =>
      request.form?.get("doc_id") === PICKER_DOC
        ? {
            status: 200,
            body: {
              data: {
                viewer: {
                  media_collections: {
                    edges: [
                      {
                        node: {
                          __typename: "MediaCollection",
                          collection_id: "17",
                          collection_name: "Recipes",
                        },
                      },
                    ],
                    page_info: { end_cursor: null, has_next_page: false },
                  },
                },
              },
            },
          }
        : STALE_DOC,
    );
    expect(result).toEqual({
      ok: true,
      collections: [{ id: "17", name: "Recipes", count: null }],
    });
    expect(requests.map((r) => r.form?.get("doc_id"))).toEqual([
      TAB_DOC,
      PICKER_DOC,
    ]);
    expect(JSON.parse(requests[1]?.form?.get("variables") ?? "")).toEqual({
      after: null,
      first: 50,
    });
  });

  it("reads the token from the page source when the module isn't there", async () => {
    const { result, requests } = await run(() => savedTab([RECIPES_NODE]), {
      cookie: SIGNED_IN.cookie,
      html: '<script>["DTSGInitialData",[],{"token":"inline-token"},258]</script>',
    });
    expect(result).toEqual(LISTED);
    expect(requests[0]?.form?.get("fb_dtsg")).toBe("inline-token");
  });

  it("strips the anti-hijacking prefix before reading the reply", async () => {
    const { result } = await runPrefixed();
    expect(result).toEqual(LISTED);
  });

  it("skips GraphQL without a csrftoken", async () => {
    const { result, requests } = await run(
      (request) => (isRestList(request) ? REST_RECIPES : NOT_FOUND_PAGE),
      { modules: SIGNED_IN.modules, cookie: "ds_user_id=1" },
    );
    expect(result).toEqual(LISTED);
    expect(requests.some(isGraphql)).toBe(false);
  });
});

/** GraphQL replies can start with `for (;;);`. */
async function runPrefixed() {
  const requests: Request[] = [];
  const body = JSON.stringify(savedTab([RECIPES_NODE]).body);
  const result: CollectionsReply = await runInNewContext(
    buildInstagramCollectionsExpression(),
    {
      URLSearchParams,
      JSON,
      location: { host: "www.instagram.com" },
      document: {
        cookie: SIGNED_IN.cookie,
        documentElement: { innerHTML: "" },
      },
      require: (name: string) =>
        new Map(Object.entries(SIGNED_IN.modules ?? {})).get(name),
      setTimeout: (fn: () => void) => setTimeout(fn, 0),
      fetch: async (url: string) => {
        requests.push({ url, method: "POST", form: null, headers: {} });
        return {
          ok: true,
          status: 200,
          headers: { get: () => "text/javascript; charset=utf-8" },
          text: async () => `for (;;);${body}`,
          json: async () => {
            throw new SyntaxError("prefixed");
          },
        };
      },
    },
  );
  return { result, requests };
}

describe("buildInstagramCollectionsExpression over REST", () => {
  it("lists collections from www when GraphQL refuses", async () => {
    const { result, requests } = await run(restOnly(() => REST_RECIPES));
    expect(result).toEqual(LISTED);
    expect(requests.filter(isRestList)).toHaveLength(1);
    expect(requests.filter(isRestList)[0]?.url).toMatch(
      /^\/api\/v1\/collections\/list\/\?/,
    );
  });

  it("reads the API host when www answers with its not-found page", async () => {
    const { result, requests } = await run(
      restOnly((r) => (onApiHost(r) ? REST_RECIPES : NOT_FOUND_PAGE)),
    );
    expect(result).toEqual(LISTED);
    const rest = requests.filter(isRestList);
    expect(rest).toHaveLength(2);
    expect(rest[1]?.url).toBe(`https://i.instagram.com${rest[0]?.url}`);
  });

  it("reads the API host when www marks the reply as failed", async () => {
    const { result } = await run(
      restOnly((r) => (onApiHost(r) ? REST_RECIPES : SOFT_FAIL_FR)),
    );
    expect(result).toEqual(LISTED);
  });

  it("reads the API host when the www request never gets a reply", async () => {
    const { result } = await run(
      restOnly((r) =>
        onApiHost(r) ? REST_RECIPES : new TypeError("Failed to fetch"),
      ),
    );
    expect(result).toEqual(LISTED);
  });

  it("keeps paging on the API host once www has failed", async () => {
    const { result, requests } = await run(
      restOnly((r): Reply => {
        if (!onApiHost(r)) return SOFT_FAIL_FR;
        return r.url.includes("max_id=")
          ? {
              status: 200,
              body: {
                items: [{ collection_id: 18, collection_name: "Trips" }],
                more_available: false,
              },
            }
          : {
              status: 200,
              body: {
                items: [{ collection_id: 17, collection_name: "Recipes" }],
                more_available: true,
                next_max_id: "next",
              },
            };
      }),
    );
    expect(result).toEqual({
      ok: true,
      collections: [
        { id: "17", name: "Recipes", count: null },
        { id: "18", name: "Trips", count: null },
      ],
    });
    const rest = requests.filter(isRestList);
    expect(rest).toHaveLength(3);
    expect(rest[2]?.url).toMatch(/^https:\/\/i\.instagram\.com\/.*max_id=next/);
  });

  it("stops on a checkpoint without trying the API host", async () => {
    const { result, requests } = await run(
      restOnly(() => ({
        status: 400,
        body: { message: "checkpoint_required", status: "fail" },
      })),
    );
    expect(result).toEqual({
      ok: false,
      reason: "checkpoint",
      detail: `${STALE_TRAIL}; www.instagram.com 400 checkpoint_required`,
      viewer: "oluwa.rafa",
    });
    expect(requests.filter(isRestList)).toHaveLength(1);
  });

  it("stops on a rate limit without trying the API host", async () => {
    const { result, requests } = await run(restOnly(() => ({ status: 429 })));
    expect(result).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(requests.filter(isRestList)).toHaveLength(1);
  });

  it("treats a login prompt as signed out", async () => {
    const { result } = await run(
      restOnly(() => ({ status: 400, body: { message: "login_required" } })),
    );
    expect(result).toMatchObject({ ok: false, reason: "auth_required" });
  });
});

describe("buildInstagramCollectionsExpression when everything fails", () => {
  it("names every query and host it tried", async () => {
    const { result } = await run(
      restOnly((r) => (onApiHost(r) ? SOFT_FAIL_FR : NOT_FOUND_PAGE)),
    );
    expect(result).toEqual({
      ok: false,
      reason: "unknown",
      detail: `${STALE_TRAIL}; www.instagram.com 404 text/html; charset="utf-8"; i.instagram.com 200 Une erreur s’est produite. Veuillez réessayer.`,
      viewer: "oluwa.rafa",
    });
  });

  it("keeps the English soft-fail message from both hosts", async () => {
    const { result } = await run(restOnly(() => SOFT_FAIL_EN));
    expect(result).toEqual({
      ok: false,
      reason: "unknown",
      detail: `${STALE_TRAIL}; www.instagram.com 200 We're sorry, but something went wrong. Please try again.; i.instagram.com 200 We're sorry, but something went wrong. Please try again.`,
      viewer: "oluwa.rafa",
    });
  });

  it("names the API host when its request never gets a reply", async () => {
    const { result } = await run(
      restOnly((r) =>
        onApiHost(r) ? new TypeError("Failed to fetch") : NOT_FOUND_PAGE,
      ),
    );
    expect(result).toMatchObject({
      ok: false,
      reason: "unknown",
      detail: expect.stringMatching(
        /; i\.instagram\.com TypeError: Failed to fetch$/,
      ),
    });
  });

  it("reports a signed-out session instead of a server error", async () => {
    const { result, requests } = await run(
      (r) => {
        if (isCurrentUser(r)) {
          return {
            status: 401,
            body: {
              message: "Please wait a few minutes before you try again.",
              require_login: true,
            },
          };
        }
        return onApiHost(r) ? SOFT_FAIL_EN : NOT_FOUND_PAGE;
      },
      { cookie: "ds_user_id=1" },
    );
    expect(result).toEqual({
      ok: false,
      reason: "auth_required",
      detail:
        'graphql no fb_dtsg; www.instagram.com 404 text/html; charset="utf-8"; i.instagram.com 200 We\'re sorry, but something went wrong. Please try again.',
    });
    expect(requests.filter(isCurrentUser)).toHaveLength(1);
  });

  it("names a GraphQL reply that isn't JSON", async () => {
    const { result } = await run((r) => {
      if (isGraphql(r)) return { status: 200 };
      if (isCurrentUser(r)) return SIGNED_IN_USER;
      return NOT_FOUND_PAGE;
    });
    expect(result).toMatchObject({
      reason: "unknown",
      detail: expect.stringMatching(
        new RegExp(`^graphql ${TAB_DOC} 200 text/html; charset="utf-8"; `),
      ),
    });
  });

  it("keeps a long detail whole through the reply check", async () => {
    const long: Reply = {
      status: 200,
      body: { message: "x".repeat(300), status: "fail" },
    };
    const { result } = await run(restOnly(() => long));
    expect(result.ok).toBe(false);
    const detail = result.ok ? "" : (result.detail ?? "");
    expect(detail.length).toBeLessThanOrEqual(600);
    expect(detail).toMatch(
      /; www\.instagram\.com 200 x+; i\.instagram\.com 200 x+$/,
    );
    expect(readCollectionsReply(JSON.parse(JSON.stringify(result)))).toEqual(
      result,
    );
  });
});

describe("listInstagramCollections", () => {
  const failed: CollectionsResult = {
    ok: false,
    reason: "unknown",
    detail: "graphql stale",
    viewer: "oluwa.rafa",
  };

  it("reads from the home page when that works", async () => {
    const readAt = vi.fn(async () => ({ ok: true as const, collections: [] }));
    await expect(listInstagramCollections(readAt)).resolves.toEqual({
      ok: true,
      collections: [],
    });
    expect(readAt).toHaveBeenCalledTimes(1);
    expect(readAt).toHaveBeenCalledWith("https://www.instagram.com/");
  });

  it("retries on your Saved page, where the current query ids load", async () => {
    const readAt = vi
      .fn<(url: string) => Promise<CollectionsResult>>()
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce({ ok: true, collections: [] });
    await expect(listInstagramCollections(readAt)).resolves.toEqual({
      ok: true,
      collections: [],
    });
    expect(readAt).toHaveBeenLastCalledWith(
      "https://www.instagram.com/oluwa.rafa/saved/",
    );
  });

  it("doesn't retry a sign-out or a failure without a username", async () => {
    for (const result of [
      {
        ok: false as const,
        reason: "auth_required" as const,
        viewer: "oluwa.rafa",
      },
      { ok: false as const, reason: "unknown" as const },
    ]) {
      const readAt = vi.fn(async () => result);
      await expect(listInstagramCollections(readAt)).resolves.toEqual(result);
      expect(readAt).toHaveBeenCalledTimes(1);
    }
  });
});
