import { DEFAULT_PREFS, type Prefs } from "@pond/schema";
import {
  type AnyRouter,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setAppRouter } from "@/shared/lib/app-router";
import { instagramCollectionsDialog } from "@/shared/state/instagram-collections";
import { claimNoticeSlot } from "@/shared/state/notices";
import { whatsNewDialog } from "@/shared/state/whats-new";
import { InstagramCollectionsDialog } from ".";
import { INSTAGRAM_COLLECTIONS_NOTICE } from "./eligibility";

const TITLE = "Instagram Collections Now Load";

let root: Root;
let host: HTMLDivElement;
let router: AnyRouter;
let accounts: Array<{ id: string; source: string; sync: object }>;
let librarySaves: number;
let prefs: Prefs;
let pushPrefs: ((next: Prefs) => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory(),
  });
  setAppRouter(router);
  accounts = [{ id: "ig-1", source: "instagram", sync: {} }];
  librarySaves = 9;
  prefs = DEFAULT_PREFS;
  pushPrefs?.(prefs);
  vi.stubGlobal("pond", {
    onPrefsChanged: (listener: (next: Prefs) => void) => {
      pushPrefs = listener;
      return () => {};
    },
    query: vi.fn(async (name: string, input: Partial<Prefs>) => {
      if (name === "settings.getPrefs") return prefs;
      if (name === "settings.setPrefs") {
        prefs = { ...prefs, ...input };
        return { prefs };
      }
      if (name === "accounts.list") return { accounts };
      return { library: librarySaves, unsorted: 0 };
    }),
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  instagramCollectionsDialog.close();
  whatsNewDialog.close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function launch(): Promise<void> {
  await act(async () => root.render(<InstagramCollectionsDialog />));
  await act(async () => vi.advanceTimersByTimeAsync(3000));
}

function seen(): boolean {
  return prefs.notices.seen.includes(INSTAGRAM_COLLECTIONS_NOTICE);
}

function shown(): boolean {
  return document.body.textContent?.includes(TITLE) ?? false;
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).find(
    (element) => element.textContent === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

it("opens the collection picker for the first affected Account", async () => {
  accounts.push({ id: "ig-2", source: "instagram", sync: {} });
  await launch();
  expect(shown()).toBe(true);
  expect(document.body.textContent).toContain(
    "Do the same for your other Instagram accounts in Sources.",
  );
  expect(seen()).toBe(true);
  expect(claimNoticeSlot("fish-intro")).toBe(false);

  await act(async () => button("Choose Collections").click());
  expect(router.history.location.href).toBe(
    "/sources/account/ig-1?page=filters",
  );
  expect(instagramCollectionsDialog.isOpen()).toBe(false);
});

it("stays dismissed after Escape, even on the next launch", async () => {
  await launch();
  expect(shown()).toBe(true);
  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(instagramCollectionsDialog.isOpen()).toBe(false);
  expect(seen()).toBe(true);

  await act(async () => root.unmount());
  root = createRoot(host);
  await launch();
  expect(instagramCollectionsDialog.isOpen()).toBe(false);
});

it("marks an unaffected library seen without a dialog", async () => {
  accounts = [
    {
      id: "ig-1",
      source: "instagram",
      sync: { importScope: { collections: [{ id: "17", name: "Recipes" }] } },
    },
  ];
  await launch();
  expect(instagramCollectionsDialog.isOpen()).toBe(false);
  expect(seen()).toBe(true);
});

it("waits for another dialog to close", async () => {
  whatsNewDialog.open();
  await launch();
  expect(instagramCollectionsDialog.isOpen()).toBe(false);
  expect(seen()).toBe(false);

  whatsNewDialog.close();
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(instagramCollectionsDialog.isOpen()).toBe(true);
});
