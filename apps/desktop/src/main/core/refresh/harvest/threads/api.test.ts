import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildSavedApiExpression } from "./api";

const ResultSchema = z.object({
  ok: z.literal(true),
  captures: z.array(z.object({ url: z.string(), body: z.string() })),
  reachedEnd: z.boolean(),
});

function feed(codes: string[], hasNextPage: boolean, endCursor: string | null) {
  return {
    edges: codes.map((code) => ({
      node: {
        thread_items: [
          {
            post: {
              code,
              user: { username: "alice" },
              caption: { text: code },
            },
          },
        ],
      },
    })),
    page_info: { has_next_page: hasNextPage, end_cursor: endCursor },
  };
}

type Feed = ReturnType<typeof feed>;

/** Threads' saved page: the first page sits in the HTML under its viewer-query preloader. */
function savedPage(firstPage: Feed, pages: Record<string, Feed> = {}) {
  const preload = JSON.stringify({
    require: [
      [
        "ScheduledServerJS",
        "handle",
        null,
        [
          {
            __bbox: {
              require: [
                [
                  "RelayPrefetchedStreamCache",
                  "next",
                  [],
                  [
                    "adp_BarcelonaSavedPageViewerQueryRelayPreloader_1",
                    { __bbox: { result: { data: { saved: firstPage } } } },
                  ],
                ],
              ],
            },
          },
        ],
      ],
    ],
  });
  const dom = new JSDOM(`<script type="application/json">${preload}</script>`, {
    runScripts: "outside-only",
    url: "https://www.threads.com/saved",
  });
  const requested: string[] = [];
  Object.assign(dom.window, {
    fetch: async (_url: string, init: { body: string }) => {
      const vars = z
        .object({ after: z.string() })
        .parse(
          JSON.parse(new URLSearchParams(init.body).get("variables") ?? ""),
        );
      requested.push(vars.after);
      const body = JSON.stringify({
        data: { saved: pages[vars.after] ?? feed([], false, null) },
      });
      return { ok: true, status: 200, text: async () => body };
    },
  });
  const run = async () =>
    ResultSchema.parse(
      // SAFETY: the expression wraps the controlled in-page function exercised by this fixture.
      await dom.window.eval(buildSavedApiExpression({ knownIds: [] })),
    );
  return { dom, run, requested };
}

describe("buildSavedApiExpression", () => {
  it("reads a one-page list from the HTML without waiting for a request", async () => {
    const { run, requested } = savedPage(
      feed(["CodeAAAAAAA", "CodeBBBBBBB"], false, null),
    );

    const result = await run();

    expect(requested).toEqual([]);
    expect(result.reachedEnd).toBe(true);
    expect(result.captures).toHaveLength(1);
    expect(result.captures[0]?.body).toContain("CodeAAAAAAA");
  });

  it("keeps the HTML's first page and replays the later pages", async () => {
    const { dom, run, requested } = savedPage(
      feed(["CodeAAAAAAA"], true, "PAGE2"),
      { PAGE2: feed(["CodeCCCCCCC"], false, null) },
    );
    Object.assign(dom.window, {
      __pondThreadsSavedRequest: {
        url: "https://www.threads.com/graphql/query",
        method: "POST",
        headers: {},
        body: `fb_api_req_friendly_name=BarcelonaSavedPageRefetchableQuery&variables=${encodeURIComponent(
          JSON.stringify({ after: "PAGE2" }),
        )}`,
      },
    });

    const result = await run();

    expect(requested).toEqual(["PAGE2"]);
    expect(result.captures.map((c) => c.body.includes("CodeAAAAAAA"))).toEqual([
      true,
      false,
    ]);
    expect(result.reachedEnd).toBe(true);
  });
});
