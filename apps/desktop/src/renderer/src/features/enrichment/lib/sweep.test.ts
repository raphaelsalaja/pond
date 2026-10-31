import { DEFAULT_PREFS, type Prefs } from "@pond/schema";
import { describe, expect, it, vi } from "vitest";
import type { Save } from "@/features/saves/types";
import {
  createEnrichmentPreferenceAccess,
  subscribeMediaUnderstandingRefresh,
} from "./sweep";
import type { Enricher } from "./types";

function save(): Save {
  return {
    id: "save-1",
    source: "local",
    sourceId: "source-1",
    url: "",
    title: null,
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: "image",
    files: [],
    tags: [],
    status: "complete",
    savedAt: 1,
    createdAt: 1,
    deletedAt: null,
  };
}

function prefs(patch: Partial<Prefs["ai"]> = {}): Prefs {
  return {
    ...DEFAULT_PREFS,
    ai: { ...DEFAULT_PREFS.ai, ...patch },
  };
}

describe("enrichment sweep preferences", () => {
  it("passes current non-default media preferences to eligibility and runs", async () => {
    const current = prefs({
      mediaUnderstandingMode: "gemma4",
      mediaUnderstandingProvider: "lmstudio",
      mediaUnderstandingModelId: "gemma4:e4b",
    });
    const eligible = vi.fn(() => true);
    const run = vi.fn(async () => null);
    const enricher: Enricher = {
      id: "test",
      enabled: () => true,
      eligible,
      run,
    };
    const access = createEnrichmentPreferenceAccess(() => current);
    const target = save();

    expect(access.eligible(enricher, target)).toBe(true);
    await access.run(enricher, target);
    expect(eligible).toHaveBeenCalledExactlyOnceWith(target, current.ai);
    expect(run).toHaveBeenCalledExactlyOnceWith(target, current.ai);
  });

  it("rescans when processing features or media routing change", () => {
    let current = prefs();
    const listeners = new Set<() => void>();
    const refresh = vi.fn();
    const unsubscribe = subscribeMediaUnderstandingRefresh({
      getPrefs: () => current,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      refresh,
    });
    const publish = (): void => {
      for (const listener of listeners) listener();
    };

    current = { ...current, ai: { ...current.ai, enableCaption: true } };
    publish();
    expect(refresh).toHaveBeenCalledTimes(1);

    current = {
      ...current,
      ai: { ...current.ai, mediaUnderstandingMode: "gemma4" },
    };
    publish();
    current = {
      ...current,
      ai: { ...current.ai, mediaUnderstandingProvider: "lmstudio" },
    };
    publish();
    current = {
      ...current,
      ai: { ...current.ai, mediaUnderstandingModelId: "gemma4:e4b" },
    };
    publish();

    expect(refresh).toHaveBeenCalledTimes(4);
    unsubscribe();
    expect(listeners.size).toBe(0);
  });
});
