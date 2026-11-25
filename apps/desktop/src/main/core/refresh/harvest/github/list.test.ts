// @vitest-environment node

import { runInContext } from "node:vm";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";
import { buildGithubStarsExpression, githubStarsUrl } from "./list";

const STARS_URL = githubStarsUrl("octocat");

/** The real cursor is base64 msgpack around the last star's time; only the time matters here. */
function cursorFor(lastStarredAt: string): string {
  return Buffer.from(
    `cursor:v2:\u0092\u00b4${lastStarredAt}\u00ce\u0000`,
    "latin1",
  ).toString("base64");
}

const PAGE_2 = cursorFor("2026-09-01T00:00:00Z");
const PAGE_3 = cursorFor("2026-06-01T00:00:00Z");

const PAGES = new Map<string, { repos: Array<string>; next?: string }>([
  ["top", { repos: ["Vercel/Next.js", "tj/commander.js"], next: PAGE_2 }],
  [PAGE_2, { repos: ["octo/one", "octo/two"], next: PAGE_3 }],
  [PAGE_3, { repos: ["octo/three"] }],
]);

function starsPage(repos: Array<string>, next?: string): string {
  const rows = repos
    .map(
      (repo) => `<div class="col-12 d-block">
  <div><h3><a href="/${repo}"><span>${repo.split("/")[0]} / </span>${repo.split("/")[1]}</a></h3></div>
  <div><p itemprop="description">About ${repo}</p></div>
</div>`,
    )
    .join("");
  const nav = next
    ? `<a href="https://github.com/octocat?after=${encodeURIComponent(next)}&amp;tab=stars">Next</a>`
    : "<button disabled>Next</button>";
  return `<!doctype html><html><body><div id="user-starred-repos">${rows}
<div class="paginate-container"><div class="BtnGroup">${nav}</div></div></div></body></html>`;
}

async function walk(
  args: Partial<ListHarvestArgs>,
  opts: { expire?: string } = {},
): Promise<{ result: ListHarvestResult; requested: Array<string> }> {
  const top = PAGES.get("top");
  const dom = new JSDOM(starsPage(top?.repos ?? [], top?.next), {
    url: STARS_URL,
    runScripts: "outside-only",
  });
  const requested: Array<string> = [];
  Object.assign(dom.window, {
    setTimeout: (fn: () => void) => setTimeout(fn, 0),
    fetch: async (url: string) => {
      const after = new URL(url).searchParams.get("after") ?? "top";
      requested.push(after);
      const page = PAGES.get(after);
      if (!page || after === opts.expire) {
        return new Response("", { status: 404 });
      }
      return new Response(starsPage(page.repos, page.next), { status: 200 });
    },
  });
  const result: ListHarvestResult = await runInContext(
    buildGithubStarsExpression({ knownIds: [], ...args }),
    dom.getInternalVMContext(),
  );
  return { result, requested };
}

function ids(result: ListHarvestResult): Array<string> {
  return result.ok ? result.entries.map((entry) => entry.sourceId) : [];
}

describe("GitHub Stars walk", () => {
  it("reads every page as lowercase entries and marks the walk complete", async () => {
    const { result } = await walk({});

    expect(ids(result)).toEqual([
      "vercel/next.js",
      "tj/commander.js",
      "octo/one",
      "octo/two",
      "octo/three",
    ]);
    expect(result).toMatchObject({
      ok: true,
      reachedEnd: true,
      complete: true,
    });
    expect(result.ok && result.entries[0]).toMatchObject({
      url: "https://github.com/vercel/next.js",
      title: "Vercel/Next.js",
      author: "Vercel",
      description: "About Vercel/Next.js",
    });
  });

  it("stops after a page of stars it already has", async () => {
    const { result, requested } = await walk({
      knownIds: ["octo/one", "octo/two"],
    });

    expect(ids(result)).toHaveLength(4);
    expect(requested).toEqual([PAGE_2]);
    expect(result).toMatchObject({ reachedEnd: true });
    expect(result.ok && result.complete).toBeFalsy();
  });

  it("ends the since limit on the page whose last star predates it", async () => {
    const { result, requested } = await walk({
      savedSince: "2026-07-01T00:00:00Z",
    });

    expect(ids(result)).toHaveLength(4);
    expect(requested).toEqual([PAGE_2]);
    expect(result.ok && result.complete).toBeFalsy();
  });

  it("resumes from a stored cursor without claiming a complete walk", async () => {
    const { result, requested } = await walk({ resumeCursor: PAGE_2 });

    expect(ids(result)).toEqual(["octo/one", "octo/two", "octo/three"]);
    expect(requested).toEqual([PAGE_2, PAGE_3]);
    expect(result).toMatchObject({ reachedEnd: true, complete: false });
  });

  it("reads from the top when a stored cursor has expired", async () => {
    const { result } = await walk({ resumeCursor: PAGE_2 }, { expire: PAGE_2 });

    expect(ids(result)[0]).toBe("vercel/next.js");
  });
});
