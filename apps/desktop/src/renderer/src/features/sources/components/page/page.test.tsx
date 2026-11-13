import { Tooltip } from "@pond/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refetchAccounts } from "@/features/sources/hooks/use-accounts";
import { sourceFlow } from "@/features/sources/state/source-flow";
import { sourcesColumnsLayout } from "@/features/sources/state/sources-columns";
import { sourcesFilters } from "@/features/sources/state/sources-filters";
import { sourcesSelection } from "@/features/sources/state/sources-selection";
import { SourcesPage } from "./";

const accounts = [
  account("ig", "instagram", "oluwa.rafa"),
  account("tw", "twitter", "raphaelsalaja"),
  account("yt", "youtube", "pond"),
];

function account(id: string, source: string, handle: string) {
  return {
    id,
    source,
    handle,
    label: null,
    avatarUrl: null,
    addedAt: "2026-01-01T00:00:00.000Z",
    sync: { lastSyncedAt: null, lastError: null, knownCount: 4 },
    connected: true,
    syncing: false,
  };
}

function selectedIds(): string[] {
  return sourcesSelection
    .snapshot()
    .map((row) => row.id)
    .toSorted();
}

function selectedRows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="row"]')].filter(
    (row) => row.getAttribute("aria-selected") === "true",
  );
}

function bodyRows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="row"]')].filter(
    (row) => row.hasAttribute("aria-selected"),
  );
}

function rowWith(text: string): HTMLElement {
  const row = bodyRows().find((item) => item.textContent?.includes(text));
  if (!row) throw new Error(`Missing source row for ${text}`);
  return row;
}

describe("Sources page selection", () => {
  let host: HTMLDivElement;
  let root: Root;
  let client: QueryClient;
  const query = vi.fn();

  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    query.mockImplementation(async (name: string) => {
      if (name === "accounts.list") return { accounts };
      if (name === "watches.list") return { watches: [] };
      return { ok: true };
    });
    vi.stubGlobal("pond", { query });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    sourcesSelection.clear();
    sourcesColumnsLayout.reset();
    sourcesFilters.reset();
    sourceFlow.close();
  });

  afterEach(async () => {
    query.mockImplementation(async (name: string) => {
      if (name === "accounts.list") return { accounts: [] };
      if (name === "watches.list") return { watches: [] };
      return { ok: true };
    });
    await refetchAccounts();
    sourcesSelection.clear();
    sourcesColumnsLayout.reset();
    sourcesFilters.reset();
    sourceFlow.close();
    await act(async () => root.unmount());
    client.clear();
    host.remove();
    vi.unstubAllGlobals();
  });

  async function render(expectedRows = 3) {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Tooltip.Provider>
            <SourcesPage />
          </Tooltip.Provider>
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(bodyRows()).toHaveLength(expectedRows);
    });
  }

  async function click(row: HTMLElement, init?: MouseEventInit) {
    await act(async () => {
      row.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, ...init }),
      );
    });
  }

  async function press(key: string, init?: KeyboardEventInit) {
    await act(async () => {
      (document.activeElement ?? document).dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
          ...init,
        }),
      );
    });
  }

  it("selects a source on click and replaces the selection on the next click", async () => {
    await render();
    const first = rowWith("@oluwa.rafa");
    const last = rowWith("@raphaelsalaja");

    await click(first);
    expect(selectedIds()).toEqual(["ig"]);
    expect(selectedRows()).toHaveLength(1);

    await click(last);
    expect(selectedIds()).toEqual(["tw"]);
    expect(selectedRows()).toHaveLength(1);
  });

  it("shows a checkbox on every row that toggles selection", async () => {
    await render();
    const checkboxes = bodyRows().map((row) =>
      row.querySelector<HTMLElement>('[role="checkbox"]'),
    );
    expect(checkboxes.every((checkbox) => checkbox != null)).toBe(true);
    expect(
      host
        .querySelector('[role="grid"][aria-label="Sources"]')
        ?.closest("[data-checkboxes]")
        ?.getAttribute("data-checkboxes"),
    ).toBe("always");

    const first =
      rowWith("@oluwa.rafa").querySelector<HTMLElement>('[role="checkbox"]');
    const last =
      rowWith("@raphaelsalaja").querySelector<HTMLElement>('[role="checkbox"]');
    await act(async () => first?.click());
    await act(async () => last?.click());
    expect(selectedIds()).toEqual(["ig", "tw"]);
    expect(first?.getAttribute("aria-checked")).toBe("true");
  });

  it("fetches every ticked source from the selection bar", async () => {
    const syncRunNow = vi.fn(async (_id: string) => ({ ok: true }));
    vi.stubGlobal("pond", { query, syncRunNow });
    await render();
    const toolbar = () =>
      host.querySelector('[role="toolbar"][aria-label="Selected Sources"]');
    expect(toolbar()).toBeNull();

    for (const handle of ["@oluwa.rafa", "@pond"]) {
      const checkbox =
        rowWith(handle).querySelector<HTMLElement>('[role="checkbox"]');
      await act(async () => checkbox?.click());
    }
    expect(toolbar()?.textContent).toContain("2 selected");

    const fetch = toolbar()?.querySelector<HTMLButtonElement>(
      'button[aria-label="Fetch New Saves"]',
    );
    await act(async () => fetch?.click());
    expect(syncRunNow.mock.calls.map(([id]) => id).toSorted()).toEqual([
      "ig",
      "yt",
    ]);

    const clear = toolbar()?.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear Selection"]',
    );
    await act(async () => clear?.click());
    expect(selectedIds()).toEqual([]);
  });

  it("disables Fetch All until the global run finishes", async () => {
    let finish: ((result: { ok: true }) => void) | null = null;
    const syncRunAll = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("pond", { query, syncRunAll });
    await render();

    const fetch = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Fetch All"]',
    );
    if (!fetch) throw new Error("Missing Fetch All");
    await act(async () => fetch.click());
    await act(async () => fetch.click());

    expect(syncRunAll).toHaveBeenCalledTimes(1);
    expect(fetch.disabled).toBe(true);
    expect(fetch.getAttribute("aria-busy")).toBe("true");

    await act(async () => finish?.({ ok: true }));
    expect(fetch.disabled).toBe(false);
  });

  it("extends and toggles with Shift and Cmd click", async () => {
    await render();
    const first = rowWith("@oluwa.rafa");
    const middle = rowWith("@pond");
    const last = rowWith("@raphaelsalaja");

    await click(first);
    await click(last, { shiftKey: true });
    expect(selectedIds()).toEqual(["ig", "tw", "yt"]);

    await click(middle, { metaKey: true });
    expect(selectedIds()).toEqual(["ig", "tw"]);
  });

  it("selects every visible source with Cmd+A and clears with Escape", async () => {
    await render();
    const grid = host.querySelector<HTMLElement>(
      '[role="grid"][aria-label="Sources"]',
    );
    if (!grid) throw new Error("Missing Sources grid");
    await act(() => grid.focus());
    await press("a", { metaKey: true });
    expect(selectedIds()).toEqual(["ig", "tw", "yt"]);
    expect(selectedRows()).toHaveLength(3);

    await press("Escape");
    expect(selectedIds()).toEqual([]);
    expect(selectedRows()).toHaveLength(0);
  });

  it("preserves selection when focus moves outside the list", async () => {
    await render();
    await click(rowWith("@oluwa.rafa"));
    expect(selectedIds()).toEqual(["ig"]);

    const search = host.querySelector('input[aria-label="Search Sources"]');
    if (!(search instanceof HTMLInputElement)) {
      throw new Error("Missing sources search");
    }
    await act(async () => {
      search.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      search.focus();
    });
    await press("Escape");
    expect(selectedIds()).toEqual(["ig"]);
    expect(selectedRows()).toHaveLength(1);
  });

  it("keeps the selection when clicking a column header", async () => {
    await render();
    await click(rowWith("@oluwa.rafa"));
    const header = host.querySelector('button[aria-label="Sort by Name"]');
    if (!(header instanceof HTMLButtonElement)) {
      throw new Error("Missing name header");
    }
    await act(async () => {
      header.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
    });
    expect(selectedIds()).toEqual(["ig"]);
  });

  it("leaves Cmd+A to the search field while typing", async () => {
    await render();
    const search = host.querySelector('input[aria-label="Search Sources"]');
    if (!(search instanceof HTMLInputElement)) {
      throw new Error("Missing sources search");
    }
    search.focus();
    await click(rowWith("@oluwa.rafa"));
    search.focus();
    expect(document.activeElement).toBe(search);

    await act(async () => {
      search.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "a",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(selectedIds()).toEqual(["ig"]);
  });

  it("filters the table from the Source chip", async () => {
    await render();
    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('[aria-label="Filter"]')
        ?.click();
    });
    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('[aria-label="Source"]')
        ?.click();
    });
    const youtube = [
      ...document.querySelectorAll('[role="menuitemcheckbox"]'),
    ].find((node) => node.textContent === "YouTube");
    if (!youtube) throw new Error("Missing YouTube filter");
    await act(async () => {
      youtube.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(bodyRows()).toHaveLength(1);
    expect(rowWith("@pond")).toBeTruthy();
  });

  it("lists the watched folder as a Folder source", async () => {
    query.mockImplementation(async (name: string) => {
      if (name === "accounts.list") return { accounts };
      if (name === "watches.list") return { watches: [] };
      if (name === "autoImport.status") {
        return {
          enabled: false,
          path: "/Users/raphael/Inbox",
          mode: "copy",
          history: [{ at: Date.now(), name: "a.jpg", mode: "copy", ok: true }],
        };
      }
      return { ok: true };
    });
    await render(4);
    const folder = rowWith("Inbox");
    expect(folder.textContent).toContain("Folder");
    expect(folder.textContent).toContain("Local");
    expect(folder.textContent).toContain("Paused");

    await click(folder);
    expect(selectedIds()).toEqual(["folder:/Users/raphael/Inbox"]);
  });
});
