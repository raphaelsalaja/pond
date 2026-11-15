import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { setAppRouter } from "@/shared/lib/app-router";
import {
  DEFAULT_SETTINGS_SECTION,
  rememberSettingsSection,
} from "@/shared/lib/open-settings";
import { configureShortcuts } from "@/shared/lib/shortcuts";
import { FileRingShortcutSetting } from "./";

afterEach(() => {
  configureShortcuts({ profile: "pond", overrides: {} });
  rememberSettingsSection(DEFAULT_SETTINGS_SECTION);
  vi.unstubAllGlobals();
});

async function render() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<FileRingShortcutSetting />));
  const button = (label: string) =>
    [...host.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === label,
    );
  return {
    host,
    button,
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it("offers setting a shortcut while the ring is unbound and still opens it", async () => {
  const openFileRing = vi.fn(async () => {});
  vi.stubGlobal("pond", { openFileRing });
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory(),
  });
  setAppRouter(router);
  const view = await render();
  try {
    expect(view.host.textContent).toContain("No shortcut yet.");
    await act(async () => view.button("Set Shortcut")?.click());
    expect(router.history.location.href).toBe(
      "/settings/shortcuts#setting-shortcuts-app.file-ring",
    );
    await act(async () => view.button("Open Ring")?.click());
    expect(openFileRing).toHaveBeenCalledOnce();
  } finally {
    await view.unmount();
  }
});

it("names the assigned shortcut and drops the setup button", async () => {
  configureShortcuts({
    profile: "pond",
    overrides: { "app.file-ring": "Control+Alt+F12" },
  });
  const view = await render();
  try {
    expect(view.host.textContent).toContain("in any app to open the ring");
    expect(view.host.textContent).toContain("F12");
    expect(view.button("Set Shortcut")).toBeUndefined();
    expect(view.button("Open Ring")).toBeDefined();
  } finally {
    await view.unmount();
  }
});
