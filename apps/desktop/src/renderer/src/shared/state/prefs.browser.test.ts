import { DEFAULT_PREFS } from "@pond/schema";
import type { Prefs } from "@pond/schema";
import { expect, it, vi } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import {
  getPrefsSnapshot,
  loadPrefs,
  savePrefsSection,
  subscribePrefsSnapshot,
} from "./prefs";

it("receives another window's preferences and keeps the main process's committed values", async () => {
  let saved: Prefs = structuredClone(DEFAULT_PREFS);
  bridge.use({
    query: {
      "settings.getPrefs": () => saved,
      "settings.setPrefs": () => {
        saved = { ...saved, window: { ...saved.window, interfaceZoom: 125 } };
        bridge.emit("onPrefsChanged", saved);
        return { ok: true, prefs: saved };
      },
    },
  });
  let unsubscribe: (() => void) | null = null;
  try {
    const prefsChanged = vi.fn();
    unsubscribe = subscribePrefsSnapshot(prefsChanged);
    await loadPrefs();
    await loadPrefs();
    expect(window.pond.onPrefsChanged).toHaveBeenCalledOnce();
    expect(bridge.listening("onPrefsChanged")).toBe(true);
    saved = {
      ...saved,
      preferences: { ...saved.preferences, soundsEnabled: false },
    };
    bridge.emit("onPrefsChanged", saved);
    expect(getPrefsSnapshot()?.preferences.soundsEnabled).toBe(false);
    await savePrefsSection("window", { interfaceZoom: 125 });
    expect(getPrefsSnapshot()?.window.interfaceZoom).toBe(125);
    expect(getPrefsSnapshot()?.preferences.soundsEnabled).toBe(false);
    expect(prefsChanged).toHaveBeenCalled();
  } finally {
    unsubscribe?.();
  }
});

it("keeps every other section by reference when one section is written", async () => {
  let saved: Prefs = structuredClone(getPrefsSnapshot() ?? DEFAULT_PREFS);
  bridge.use({
    query: {
      "settings.getPrefs": () => structuredClone(saved),
      "settings.setPrefs": () => {
        saved = {
          ...saved,
          saveRecents: { entries: [{ saveId: "a", visitedAt: 1 }] },
        };
        return { ok: true, prefs: structuredClone(saved) };
      },
    },
  });
  await loadPrefs();
  const before = getPrefsSnapshot();
  await savePrefsSection("saveRecents", {
    entries: [{ saveId: "a", visitedAt: 1 }],
  });
  const after = getPrefsSnapshot();
  expect(after?.saveRecents).not.toBe(before?.saveRecents);
  expect(after?.window).toBe(before?.window);
  expect(after?.preferences).toBe(before?.preferences);
});
