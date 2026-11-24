import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
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

  it("invites adding files instead of clearing a search", async () => {
    await act(async () => root.render(<FolderEmpty folderId="posters" />));
    const text = host.textContent ?? "";
    expect(text).toContain("No Saves in This Folder");
    expect(text).toContain("Paste or drop files, images, and links here.");
    expect(text).not.toContain("Import Folders");
    expect(text).not.toContain("No Results Found");
    expect(text).not.toContain("Clear Search and Filters");
    const buttons = [...host.querySelectorAll("button")];
    expect(buttons.map((button) => button.textContent)).toEqual(["Add Files"]);
  });

  it("picks files into the open folder", async () => {
    const query = vi.fn(async (name: string) => {
      if (name === "saves.pickImportPaths") {
        return { paths: ["/tmp/a.png"] };
      }
      if (name === "saves.reviewImportDuplicates") {
        return { candidates: [] };
      }
      return { ok: true, ids: ["a"] };
    });
    vi.stubGlobal("pond", { query });
    await act(async () => root.render(<FolderEmpty folderId="posters" />));
    const add = host.querySelector("button");
    await act(async () => add?.click());

    await vi.waitFor(() =>
      expect(query).toHaveBeenCalledWith("saves.importFiles", {
        paths: ["/tmp/a.png"],
        folderIds: ["posters"],
      }),
    );
    expect(query).toHaveBeenCalledWith("saves.pickImportPaths", {
      kind: "files",
    });
  });

  it("has no action without a folder to add to", async () => {
    await act(async () => root.render(<FolderEmpty />));
    expect(host.querySelector("button")).toBeNull();
  });

  it("says saves are downloading when the folder is waiting on them", async () => {
    const router = await mountInRouter(<FolderEmpty downloading={3} />);
    const text = host.textContent ?? "";
    expect(text).toContain("Downloading 3 Saves");
    expect(text).toContain(
      "They appear in this folder as each download finishes.",
    );
    expect(text).not.toContain("No Saves in This Folder");
    const link = host.querySelector<HTMLAnchorElement>('a[role="link"]');
    expect(link?.textContent).toBe("Open Downloads");
    expect(link?.getAttribute("href")).toBe("/downloads");
    await act(async () => link?.click());
    expect(router.state.location.pathname).toBe("/downloads");
  });

  it("uses the singular for one download", async () => {
    await mountInRouter(<FolderEmpty downloading={1} />);
    expect(host.textContent).toContain("Downloading 1 Save");
    expect(host.textContent).not.toContain("1 Saves");
  });
});
