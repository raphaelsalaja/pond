import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { setAppRouter } from "@/shared/lib/app-router";
import { viewAccountItems } from "./view-account-items";

const ACCOUNT = "acct-1";

async function openAt(path: string) {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  setAppRouter(router);
  await router.load();
  return router;
}

function searchOf(router: Awaited<ReturnType<typeof openAt>>) {
  return router.parseLocation(router.history.location);
}

describe("viewAccountItems", () => {
  it.each([
    `/sources/account/${ACCOUNT}`,
    "/folders/Alpha?filters=%7B%22combinator%22%3A%22and%22%2C%22rules%22%3A%5B%5D%7D",
    "/views/smart",
    "/trash?q=old",
  ])("opens All filtered to one source from %s", async (path) => {
    const router = await openAt(path);

    viewAccountItems(ACCOUNT);

    const location = searchOf(router);
    expect(location.pathname).toBe("/");
    expect(location.search).toEqual({
      filters: {
        combinator: "and",
        rules: [{ field: "account", operator: "eq", value: ACCOUNT }],
      },
    });
  });

  it("filters several sources together on All", async () => {
    const router = await openAt("/sources");

    viewAccountItems(["acct-1", "acct-2"]);

    expect(searchOf(router).search).toEqual({
      filters: {
        combinator: "and",
        rules: [{ field: "account", operator: "in", value: ["acct-1", "acct-2"] }],
      },
    });
  });

  it("ignores an empty source id", async () => {
    const router = await openAt("/sources/account/acct-1");

    viewAccountItems([]);

    expect(router.history.location.pathname).toBe("/sources/account/acct-1");
  });
});
