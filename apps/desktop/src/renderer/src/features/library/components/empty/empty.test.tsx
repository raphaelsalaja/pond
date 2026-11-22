import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FolderEmpty } from "./";

describe("FolderEmpty", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  async function mountInRouter(node: ReactNode) {
    const rootRoute = createRootRoute({ component: () => node });
    const children = ["/", "/downloads"].map((path) =>
      createRoute({
        getParentRoute: () => rootRoute,
        path,
        component: () => null,
      }),
    );
    const router = createRouter({
      routeTree: rootRoute.addChildren(children),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await act(async () => {
      await router.load();
      root.render(<RouterProvider router={router} />);
    });
    return router;
  }

  it("invites dropping files instead of clearing a search", async () => {
    await act(async () => root.render(<FolderEmpty />));
    const text = host.textContent ?? "";
    expect(text).toContain("No saves in this folder");
    expect(text).toContain("Drag files onto this window to add them here.");
    expect(text).not.toContain("Import Folders");
    expect(text).not.toContain("Import Files");
    expect(text).not.toContain("No results found");
    expect(text).not.toContain("Clear Search and Filters");
  });

  it("says saves are downloading when the folder is waiting on them", async () => {
    const router = await mountInRouter(<FolderEmpty downloading={3} />);
    const text = host.textContent ?? "";
    expect(text).toContain("Downloading 3 saves");
    expect(text).toContain(
      "They appear in this folder as each download finishes.",
    );
    expect(text).not.toContain("No saves in this folder");
    const link = host.querySelector<HTMLAnchorElement>('a[role="link"]');
    expect(link?.textContent).toBe("Open Downloads");
    expect(link?.getAttribute("href")).toBe("/downloads");
    await act(async () => link?.click());
    expect(router.state.location.pathname).toBe("/downloads");
  });

  it("uses the singular for one download", async () => {
    await mountInRouter(<FolderEmpty downloading={1} />);
    expect(host.textContent).toContain("Downloading 1 save");
    expect(host.textContent).not.toContain("1 saves");
  });
});
