import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type ImportScopeAccount,
  importScopeFlow,
} from "@/features/sources/state/import-scope-flow";
import { ImportScopeChoices, ImportScopeConfirm } from ".";

let root: Root;
let host: HTMLDivElement;
let query: ReturnType<typeof vi.fn>;
let syncRunNow: ReturnType<typeof vi.fn>;

const BOARDS = [
  { id: "915", name: "Design References", itemCount: 42 },
  { id: "88", name: "Memes", itemCount: 1 },
];

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
  query = vi.fn(async (name: string) => {
    if (name === "accounts.importOptions") {
      return { ok: true, collections: BOARDS };
    }
    if (name === "accounts.list") return { accounts: [] };
    return { ok: true };
  });
  syncRunNow = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal("pond", { query, syncRunNow });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  importScopeFlow.clear();
  vi.unstubAllGlobals();
});

async function renderFor(account: ImportScopeAccount): Promise<void> {
  importScopeFlow.open(account);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ImportScopeChoices />
        <ImportScopeConfirm />
      </QueryClientProvider>,
    );
  });
}

function toggle(label: string): HTMLElement {
  const found = host.querySelector<HTMLElement>(
    `[role="switch"][aria-label="${label}"]`,
  );
  if (!found) throw new Error(`Missing switch: ${label}`);
  return found;
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll("button")).find(
    (element) => element.textContent === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

async function choose(field: string, option: string): Promise<void> {
  const trigger = host.querySelector<HTMLElement>(`[aria-label="${field}"]`);
  if (!trigger) throw new Error(`Missing select: ${field}`);
  await act(async () => trigger.click());
  const found = await vi.waitFor(() => {
    const match = Array.from(
      document.querySelectorAll<HTMLElement>('[role="option"]'),
    ).find((element) => element.textContent?.startsWith(option));
    if (!match) throw new Error(`Missing option: ${option}`);
    return match;
  });
  await act(async () => found.click());
}

it("starts the first import with only the lists you keep", async () => {
  await renderFor({
    id: "acc-instagram",
    source: "instagram",
    sync: { importPending: true },
  });
  expect(toggle("Saved Posts").getAttribute("aria-checked")).toBe("true");
  await act(async () => toggle("Liked Posts").click());
  await act(async () => button("Start Import").click());

  expect(query).toHaveBeenCalledWith("accounts.setImportScope", {
    accountId: "acc-instagram",
    scope: { listKinds: ["saved"] },
  });
  expect(syncRunNow).toHaveBeenCalledWith("acc-instagram");
});

it("won't start an import that would bring in nothing", async () => {
  await renderFor({
    id: "acc-youtube",
    source: "youtube",
    sync: { importPending: true },
  });
  await act(async () => toggle("Saved Videos").click());
  await act(async () => toggle("Liked Videos").click());
  expect(button("Start Import").disabled).toBe(true);
});

it("imports chosen Pinterest boards into Folders", async () => {
  await renderFor({
    id: "acc-pinterest",
    source: "pinterest",
    sync: { importPending: true },
  });
  expect(host.textContent).toContain("All Pins");
  expect(host.textContent).not.toContain("Add to Folders");

  await choose("Boards", "Design References");
  expect(document.body.textContent).toContain("42 pins");
  expect(document.body.textContent).toContain("1 pin");
  await vi.waitFor(() => {
    expect(toggle("Add to Folders").getAttribute("aria-checked")).toBe("true");
  });
  await act(async () => button("Start Import").click());
  expect(query).toHaveBeenCalledWith("accounts.setImportScope", {
    accountId: "acc-pinterest",
    scope: { collections: [{ id: "915", name: "Design References" }] },
  });
});

it("keeps chosen boards out of Folders when you turn it off", async () => {
  await renderFor({
    id: "acc-pinterest",
    source: "pinterest",
    sync: { importScope: { collections: [{ id: "915", name: "Design" }] } },
  });
  await act(async () => toggle("Add to Folders").click());
  await act(async () => button("Save").click());
  expect(query).toHaveBeenCalledWith("accounts.setImportScope", {
    accountId: "acc-pinterest",
    scope: {
      collections: [{ id: "915", name: "Design" }],
      addToFolders: false,
    },
  });
});

it("explains a board list Pond couldn't load", async () => {
  query.mockImplementation(async (name: string) =>
    name === "accounts.importOptions"
      ? {
          ok: false,
          error:
            "Pinterest signed you out. Reconnect the Account to load your boards.",
        }
      : { ok: true },
  );
  await renderFor({
    id: "acc-pinterest",
    source: "pinterest",
    sync: { importScope: { collections: [{ id: "915", name: "Design" }] } },
  });
  expect(query).not.toHaveBeenCalledWith(
    "accounts.importOptions",
    expect.anything(),
  );
  const trigger = host.querySelector<HTMLElement>('[aria-label="Boards"]');
  await act(async () => trigger?.click());
  await vi.waitFor(() => {
    expect(host.textContent).toContain("Pinterest signed you out.");
  });
  expect(button("Try Again")).toBeTruthy();
});

it("saves a change for an active Account without starting a sync", async () => {
  await renderFor({
    id: "acc-instagram",
    source: "instagram",
    sync: { importScope: { listKinds: ["liked"] } },
  });
  expect(toggle("Saved Posts").getAttribute("aria-checked")).toBe("false");
  await act(async () => toggle("Saved Posts").click());
  await act(async () => button("Save").click());

  expect(query).toHaveBeenCalledWith("accounts.setImportScope", {
    accountId: "acc-instagram",
    scope: {},
  });
  expect(syncRunNow).not.toHaveBeenCalled();
});

it("starts a TikTok import from Liked Videos alone", async () => {
  await renderFor({
    id: "acc-tiktok",
    source: "tiktok",
    sync: { importPending: true },
  });
  await act(async () => toggle("Favorites").click());
  await act(async () => button("Start Import").click());
  expect(query).toHaveBeenCalledWith("accounts.setImportScope", {
    accountId: "acc-tiktok",
    scope: { listKinds: ["liked"] },
  });
});

it("hides collections while the saved list is off", async () => {
  await renderFor({
    id: "acc-instagram",
    source: "instagram",
    sync: { importPending: true },
  });
  expect(host.textContent).toContain("All Saved Posts");
  await act(async () => toggle("Saved Posts").click());
  await vi.waitFor(() => {
    expect(host.textContent).not.toContain("All Saved Posts");
  });
});

it("saves media and date filters with the scope", async () => {
  await renderFor({
    id: "acc-reddit",
    source: "reddit",
    sync: { importPending: true },
  });
  await act(async () => button("Text Posts").click());
  await choose("Posted Since", "Custom Date");
  const date = await vi.waitFor(() => {
    const field = host.querySelector<HTMLInputElement>('input[type="date"]');
    if (!field) throw new Error("Missing date field");
    return field;
  });
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(date, "2026-01-01");
    date.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button("Start Import").click());
  expect(query).toHaveBeenCalledWith("accounts.setImportScope", {
    accountId: "acc-reddit",
    scope: { mediaKinds: ["image", "video"], since: "2026-01-01" },
  });
});

it("keeps at least one kind of post", async () => {
  await renderFor({
    id: "acc-reddit",
    source: "reddit",
    sync: { importScope: { mediaKinds: ["video"] } },
  });
  await act(async () => button("Videos").click());
  expect(button("Videos").hasAttribute("data-pressed")).toBe(true);
});
