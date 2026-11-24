// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAppRouter } from "@/shared/lib/app-router";
import { menuLabels, topLevelMenuLabels } from "@/shared/test/menu-labels";
import { buildHelpMenuItems, HelpMenu } from "./help-menu";

function findItem(items: ReturnType<typeof buildHelpMenuItems>, label: string) {
  return items.find(
    (candidate) => "label" in candidate && candidate.label === label,
  );
}

function build(
  overrides: Partial<Parameters<typeof buildHelpMenuItems>[0]> = {},
) {
  return buildHelpMenuItems({
    onBrowserExtension: () => {},
    onCheckForUpdates: () => {},
    ...overrides,
  });
}

describe("help menu spec", () => {
  it("lists app, release, help, and contact actions without submenus", () => {
    const items = build();
    const labels = [
      "Settings",
      "Keyboard Shortcuts",
      "Check for Updates",
      "Browser Extension",
      "Help Center",
      "What's New",
      "Report an Issue",
      "Export Debug Report",
      "Twitter",
      "GitHub",
      "Email",
      "Buy Me a Coffee",
    ];
    expect(menuLabels(items)).toEqual(labels);
    expect(topLevelMenuLabels(items)).toEqual(labels);
    for (const label of labels) {
      const item = findItem(items, label);
      expect(item && "icon" in item ? item.icon : null).not.toBeNull();
    }
    expect(labels.join(" ")).not.toContain("…");
    expect(labels.join(" ")).not.toContain("...");
  });

  it("starts an update check instead of opening Settings", () => {
    const onCheckForUpdates = vi.fn();
    const item = findItem(build({ onCheckForUpdates }), "Check for Updates");
    if (!item || !("onClick" in item) || !item.onClick) {
      throw new Error("Missing Check for Updates item");
    }
    item.onClick();
    expect(onCheckForUpdates).toHaveBeenCalledOnce();
  });

  it("opens the browser extension dialog", () => {
    const onBrowserExtension = vi.fn();
    const item = findItem(build({ onBrowserExtension }), "Browser Extension");
    if (!item || !("onClick" in item) || !item.onClick) {
      throw new Error("Missing Browser Extension item");
    }
    item.onClick();
    expect(onBrowserExtension).toHaveBeenCalledOnce();
  });
});

const query = vi.fn(async (_name: string) => ({ ok: true }));
const openExternal = vi.fn(async (_url: string) => ({ ok: true }));

function storeButton(dialog: Element | null, label: string) {
  const button = [...(dialog?.querySelectorAll("button") ?? [])].find(
    (entry) => entry.textContent === label,
  );
  if (!button) {
    throw new Error(`Missing ${label} button`);
  }
  return button;
}

describe("help menu", () => {
  let host: HTMLDivElement;
  let root: Root;

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
      query,
      openExternal,
      appInfo: async () => ({
        name: "Pond",
        version: "1.0.0",
        platform: "darwin",
        arch: "arm64",
        username: "rafa",
        isPackaged: true,
      }),
    });
    query.mockClear();
    openExternal.mockClear();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  async function clickItem(label: string) {
    await act(async () => root.render(<HelpMenu />));
    const trigger = host.querySelector("button");
    if (!trigger) {
      throw new Error("Missing help menu trigger");
    }
    await act(async () => trigger.click());
    const item = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((entry) => entry.textContent?.includes(label));
    if (!item) {
      throw new Error(`Missing ${label}`);
    }
    await act(async () => item.click());
  }

  async function openExtensionDialog(): Promise<Element | null> {
    await clickItem("Browser Extension");
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"]')).not.toBeNull(),
    );
    return document.querySelector('[role="dialog"]');
  }

  it("opens each browser's store listing from the extension dialog", async () => {
    const dialog = await openExtensionDialog();
    await act(async () => storeButton(dialog, "Add to Chrome").click());
    expect(openExternal).toHaveBeenLastCalledWith(
      "https://chromewebstore.google.com/detail/ghigndnldiagchoaifgndleogpkendbc",
    );
    await act(async () => storeButton(dialog, "Add to Firefox").click());
    expect(openExternal).toHaveBeenLastCalledWith(
      "https://addons.mozilla.org/firefox/addon/desktop%40pond.so/",
    );
  });

  it("says so when a store page doesn't open", async () => {
    openExternal.mockResolvedValueOnce({ ok: false });
    const dialog = await openExtensionDialog();
    await act(async () => storeButton(dialog, "Add to Chrome").click());
    await vi.waitFor(() =>
      expect(dialog?.textContent).toContain(
        "Pond couldn't open the store page. Try again.",
      ),
    );
  });

  it("checks for updates instead of opening Settings", async () => {
    const history = createMemoryHistory({ initialEntries: ["/"] });
    setAppRouter(createRouter({ routeTree: createRootRoute(), history }));
    await clickItem("Check for Updates");
    expect(query).toHaveBeenCalledWith("updates.checkNow", {});
    expect(history.location.href).not.toContain("/settings");
  });
});
