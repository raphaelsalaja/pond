import type { JsonValue } from "@pond/schema/json";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readVimeoCapture, readVimeoLists } from "./api";
import type { VimeoGet } from "./api";

const get = vi.fn<VimeoGet>();

const SIGNED_IN = { user: { link: "https://vimeo.com/urza" }, jwt: "tok" };

interface ListPage {
  ids: Array<string>;
  next?: boolean;
}

interface Site {
  viewer?: JsonValue;
  pages: Map<string, ListPage>;
  hydrate?: number;
}

function json(body: JsonValue, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function listHtml(page: ListPage): string {
  const rows = page.ids
    .map(
      (id) =>
        `<li id="clip_${id}"><a href="/${id}"></a><time datetime="2022-07-10T06:26:${id.padStart(2, "0").slice(-2)}-04:00"></time></li>`,
    )
    .join("");
  const link = page.next ? '<link rel="next" href="/x/page:2">' : "";
  return `${link}<ol>${rows}</ol>`;
}

function serve(site: Site) {
  get.mockImplementation(async (raw) => {
    const url = new URL(raw);
    if (url.pathname === "/_next/viewer") {
      return json(site.viewer ?? SIGNED_IN);
    }
    if (url.host === "api.vimeo.com") {
      if (site.hydrate) {
        return json({ error: "nope" }, site.hydrate);
      }
      const uris = url.searchParams.get("uris")?.split(",") ?? [];
      return json({
        data: uris.map((uri) => ({ uri, name: `video ${uri.slice(8)}` })),
      });
    }
    const page = site.pages.get(url.pathname);
    return new Response(page ? listHtml(page) : "<ol></ol>");
  });
}

function ids(
  result: Awaited<ReturnType<typeof readVimeoLists>>,
): Array<string> {
  return result.ok ? result.entries.map((e) => e.sourceId) : [];
}

beforeEach(() => {
  get.mockReset();
});

describe("readVimeoLists", () => {
  it("merges Likes and Watch Later into one entry per video", async () => {
    serve({
      pages: new Map([
        ["/urza/likes/page:1/", { ids: ["10", "11"] }],
        ["/watchlater/page:1/", { ids: ["11", "12"] }],
      ]),
    });
    const result = await readVimeoLists({ knownIds: [] }, get);
    expect(result).toMatchObject({ ok: true, reachedEnd: true });
    expect(result.ok && result.entries).toEqual([
      expect.objectContaining({
        sourceId: "10",
        listKinds: ["liked"],
        title: "video 10",
      }),
      expect.objectContaining({
        sourceId: "11",
        listKinds: ["liked", "saved"],
      }),
      expect.objectContaining({ sourceId: "12", listKinds: ["saved"] }),
    ]);
    const pageCall = get.mock.calls.find(([u]) => u.includes("/likes/"));
    expect(pageCall?.[1]["x-requested-with"]).toBe("XMLHttpRequest");
    const apiCall = get.mock.calls.find(([u]) => u.includes("api.vimeo.com"));
    expect(apiCall?.[1].authorization).toBe("jwt tok");
  });

  it("reads only the lists the import keeps", async () => {
    serve({
      pages: new Map([
        ["/urza/likes/page:1/", { ids: ["10"] }],
        ["/watchlater/page:1/", { ids: ["12"] }],
      ]),
    });
    const result = await readVimeoLists(
      { knownIds: [], listKinds: ["saved"] },
      get,
    );
    expect(ids(result)).toEqual(["12"]);
    expect(get.mock.calls.some(([u]) => u.includes("/likes/"))).toBe(false);
  });

  it("keeps bare entries when hydration fails", async () => {
    serve({
      pages: new Map([["/urza/likes/page:1/", { ids: ["10"] }]]),
      hydrate: 500,
    });
    const result = await readVimeoLists(
      { knownIds: [], listKinds: ["liked"] },
      get,
    );
    expect(result.ok && result.entries).toEqual([
      {
        sourceId: "10",
        url: "https://vimeo.com/10",
        mediaType: "video",
        listKinds: ["liked"],
        savedAt: "2022-07-10T10:26:10.000Z",
      },
    ]);
  });

  it("follows rel=next and stops on a short page without it", async () => {
    const full = Array.from({ length: 12 }, (_, i) => String(100 + i));
    serve({
      pages: new Map([
        ["/urza/likes/page:1/", { ids: full, next: true }],
        ["/urza/likes/page:2/", { ids: ["99"] }],
        ["/urza/likes/page:3/", { ids: ["98"] }],
      ]),
    });
    const result = await readVimeoLists(
      { knownIds: [], listKinds: ["liked"] },
      get,
    );
    expect(ids(result)).toEqual([...full, "99"]);
  });

  it("resumes a backfill at the list and page it stopped on", async () => {
    serve({
      pages: new Map([
        ["/urza/likes/page:1/", { ids: ["10"] }],
        ["/urza/likes/page:7/", { ids: ["70"] }],
        ["/watchlater/page:1/", { ids: ["12"] }],
      ]),
    });
    const result = await readVimeoLists(
      { knownIds: [], resumeCursor: "liked:7" },
      get,
    );
    expect(ids(result)).toEqual(["70", "12"]);
  });

  it("reports a signed-out viewer", async () => {
    serve({ viewer: { user: null, jwt: "anon" }, pages: new Map() });
    expect(await readVimeoLists({ knownIds: [] }, get)).toEqual({
      ok: false,
      reason: "auth_required",
    });
  });
});

describe("readVimeoCapture", () => {
  it("reads one video from the API", async () => {
    get.mockImplementation(async (raw) =>
      raw.includes("/_next/viewer")
        ? json({ user: null, jwt: "anon" })
        : json({ uri: "/videos/76979871", name: "Vimeo Player" }),
    );
    const result = await readVimeoCapture("76979871", get);
    expect(result.ok && result.capture.title).toBe("Vimeo Player");
  });

  it("treats a region block as not found", async () => {
    get.mockImplementation(async (raw) =>
      raw.includes("/_next/viewer")
        ? json({ user: null, jwt: "anon" })
        : json({ error_code: 5451 }, 404),
    );
    expect(await readVimeoCapture("76979871", get)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});
