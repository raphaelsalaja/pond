import { DEFAULT_SOURCE_SYNC_PREFS } from "@pond/schema/db";
import type { Source } from "@pond/schema/db";
import { Tooltip } from "@pond/ui";
import { isHTMLTag } from "@pond/ui/dom";
import type { QueryResult } from "@shared/query-contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refetchAccounts } from "@/features/sources/hooks/use-accounts";
import { sourceFlow } from "@/features/sources/state/source-flow";
import { sourcesColumnsLayout } from "@/features/sources/state/sources-columns";
import { sourcesFilters } from "@/features/sources/state/sources-filters";
import { sourcesSelection } from "@/features/sources/state/sources-selection";
import { bridge } from "@/shared/test/pond-bridge";
import type { QueryHandlers } from "@/shared/test/pond-bridge";
import { SourcesPage } from "./";

type AccountRow = QueryResult<"accounts.list">["accounts"][number];

const accounts = [
  account("ig", "instagram", "oluwa.rafa"),
  account("tw", "twitter", "raphaelsalaja"),
  account("yt", "youtube", "pond"),
];

function account(id: string, source: Source, handle: string): AccountRow {
  return {
    id,
    source,
    handle,
    identityKey: null,
    label: null,
    avatarUrl: null,
    addedAt: "2026-01-01T00:00:00.000Z",
    sync: { ...DEFAULT_SOURCE_SYNC_PREFS, knownCount: 4 },
    connected: true,
    syncing: false,
  };
}

function sourceQueries(rows: Array<AccountRow>): QueryHandlers {
  return {
    "accounts.list": () => ({ accounts: rows }),
    "watches.list": () => ({ watches: [] }),
    "autoImport.status": () => ({
      enabled: false,
      path: "",
      mode: "copy",
      history: [],
    }),
    "sources.overview": () => ({ saves: 0, bytes: 0, recent: [] }),
  };
}

function selectedIds(): Array<string> {
  return sourcesSelection
    .snapshot()
    .map((row) => row.id)
    .toSorted();
}

function selectedRows(): Array<HTMLElement> {
  return [...document.querySelectorAll<HTMLElement>('[role="row"]')].filter(
    (row) => row.getAttribute("aria-selected") === "true",
  );
}

function bodyRows(): Array<HTMLElement> {
  return [...document.querySelectorAll<HTMLElement>('[role="row"]')].filter(
    (row) => row.hasAttribute("aria-selected"),
  );
}

function rowWith(text: string): HTMLElement {
  const row = bodyRows().find((item) => item.textContent?.includes(text));
  if (!row) {
    throw new Error(`Missing source row for ${text}`);
  }
  return row;
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

describe("Sources page selection", () => {
  let host: HTMLDivElement;
  let root: Root;
  let client: QueryClient;

  beforeEach(() => {
    bridge.use({ query: sourceQueries(accounts) });
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
    bridge.use({ query: sourceQueries([]) });
    await refetchAccounts();
    sourcesSelection.clear();
    sourcesColumnsLayout.reset();
    sourcesFilters.reset();
    sourceFlow.close();
    await act(async () => root.unmount());
    client.clear();
    host.remove();
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

  function toolbar() {
    return host.querySelector(
      '[role="toolbar"][aria-label="Selected Sources"]',
    );
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
    expect(checkboxes.every((checkbox) => checkbox !== null)).toBe(true);
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
    const fetched: Array<string> = [];
    bridge.use({
      syncRunNow: async (id) => {
        fetched.push(id);
        return { ok: true };
      },
    });
    await render();
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
    expect(fetched.toSorted()).toEqual(["ig", "yt"]);

    const clear = toolbar()?.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear Selection"]',
    );
    await act(async () => clear?.click());
    expect(selectedIds()).toEqual([]);
  });

  it("disables Fetch All until the global run finishes", async () => {
    const run = Promise.withResolvers<{ ok: true }>();
    bridge.use({ syncRunAll: () => run.promise });
    await render();

    const fetch = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Fetch All"]',
    );
    if (!fetch) {
      throw new Error("Missing Fetch All");
    }
    await act(async () => fetch.click());
    await act(async () => fetch.click());

    expect(window.pond.syncRunAll).toHaveBeenCalledTimes(1);
    expect(fetch.disabled).toBe(true);
    expect(fetch.getAttribute("aria-busy")).toBe("true");

    await act(async () => run.resolve({ ok: true }));
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
    if (!grid) {
      throw new Error("Missing Sources grid");
    }
    act(() => {
      grid.focus();
    });
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
    if (!isHTMLTag(search, "input")) {
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
    if (!isHTMLTag(header, "button")) {
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
    if (!isHTMLTag(search, "input")) {
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
    if (!youtube) {
      throw new Error("Missing YouTube filter");
    }
    await act(async () => {
      youtube.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(bodyRows()).toHaveLength(1);
    expect(rowWith("@pond")).toBeTruthy();
  });

  it("lists the watched folder as a Local source", async () => {
    bridge.use({
      query: {
        "autoImport.status": () => ({
          enabled: false,
          path: "/Users/raphael/Inbox",
          mode: "copy",
          history: [{ at: Date.now(), name: "a.jpg", mode: "copy", ok: true }],
        }),
      },
    });
    await render(4);
    const folder = rowWith("Inbox");
    expect(folder.textContent).toContain("Local /Inbox");
    expect(folder.textContent).toContain("Paused");

    await click(folder);
    expect(selectedIds()).toEqual(["folder:/Users/raphael/Inbox"]);
  });
});
