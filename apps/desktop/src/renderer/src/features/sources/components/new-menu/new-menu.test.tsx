import { isHTMLElement } from "@pond/ui/dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sourceFlow } from "@/features/sources/state/source-flow";
import { sourceNewMenu } from "@/features/sources/state/source-new-menu";
import { watchFlow } from "@/features/sources/state/watch-flow";
import { NewSourceMenu } from ".";

const labels = ["New Source", "New Watch", "New Folder"];

describe("new source menu", () => {
  let host: HTMLDivElement;
  let root: Root;
  const onWatchedFolder = vi.fn();

  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("pond", {
      query: vi.fn(async () => ({ accounts: [] })),
      connectSource: vi.fn(async () => ({ ok: true })),
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    sourceFlow.close();
    sourceNewMenu.close();
    watchFlow.clear();
    onWatchedFolder.mockReset();
  });

  afterEach(async () => {
    sourceFlow.close();
    sourceNewMenu.close();
    watchFlow.clear();
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  async function renderMenu(controlled = false) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <NewSourceMenu
            controlled={controlled}
            onWatchedFolder={onWatchedFolder}
          />
        </QueryClientProvider>,
      ),
    );
  }

  async function openMenu() {
    await renderMenu();
    const trigger = [...document.querySelectorAll("button")].find(
      (el) => el.getAttribute("aria-label") === "New Source",
    );
    if (!trigger) {
      throw new Error("Missing New Source");
    }
    expect(trigger.getAttribute("data-variant")).toBe("ghost");
    await act(async () => trigger.click());
  }

  it("lists every source create action", async () => {
    await openMenu();
    const text = document.body.textContent ?? "";
    for (const label of labels) {
      expect(text).toContain(label);
    }
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("picks a watched folder from the same menu", async () => {
    await openMenu();
    const item = [...document.querySelectorAll('[role="menuitem"]')].find(
      (el) => el.textContent?.includes("New Folder"),
    );
    if (!isHTMLElement(item)) {
      throw new Error("Missing folder");
    }
    await act(async () => item.click());
    expect(onWatchedFolder).toHaveBeenCalledOnce();
    expect(sourceFlow.current()).toBeNull();
  });

  it("opens from the new-source shortcut store", async () => {
    await renderMenu(true);
    expect(document.body.textContent).not.toContain("New Watch");
    await act(async () => sourceNewMenu.open());
    expect(document.body.textContent).toContain("New Watch");
  });
});
