import { DEFAULT_PREFS } from "@pond/schema";
import type { Prefs } from "@pond/schema";
import { describe, expect, it, vi } from "vitest";
import type { Save } from "@/features/saves/types";
import type { MediaUnderstandingRouter } from "../media-understanding-router";
import { createOcrEnricher } from "./ocr";

function prefs(mode: Prefs["ai"]["mediaUnderstandingMode"]): Prefs["ai"] {
  return { ...DEFAULT_PREFS.ai, mediaUnderstandingMode: mode };
}

function save(ocrModel: string | null = null): Save {
  return {
    id: "save-1",
    source: "local",
    sourceId: "source-1",
    url: "",
    title: null,
    description: null,
    author: null,
    notes: null,
    mediaUrl: "pond://save-1/image.png",
    mediaType: "image",
    files: [
      {
        kind: "media",
        path: "image.png",
        sha256: "hash",
        size: 1,
        mimeType: "image/png",
      },
    ],
    tags: [],
    status: "complete",
    ocrModel,
    savedAt: 1,
    createdAt: 1,
    deletedAt: null,
  };
}

function router(): MediaUnderstandingRouter {
  return {
    primaryModel: (task, ai) =>
      ai.mediaUnderstandingMode === "gemma4"
        ? `lmstudio/gemma4:e4b:${task}:v1`
        : "florence:v2",
    run: vi.fn(async () => ({
      text: "TOTAL 12.50",
      model: "lmstudio/gemma4:e4b:ocr:v1",
    })),
  };
}

describe("OCR enricher", () => {
  it("refreshes when the active primary model changes", () => {
    const selectedRouter = router();
    const enricher = createOcrEnricher(selectedRouter);
    const gemmaPrefs = {
      ...prefs("gemma4"),
      mediaUnderstandingProvider: "lmstudio" as const,
      mediaUnderstandingModelId: "gemma4:e4b",
    };

    expect(enricher.eligible(save("florence:v2"), prefs("florence"))).toBe(
      false,
    );
    expect(enricher.eligible(save("florence:v2"), gemmaPrefs)).toBe(true);
    expect(
      enricher.eligible(save("lmstudio/gemma4:e4b:ocr:v1"), gemmaPrefs),
    ).toBe(false);
  });

  it("persists empty OCR as null with the completed model stamp", async () => {
    const selectedRouter = router();
    selectedRouter.run = vi.fn(async () => ({
      text: "",
      model: "lmstudio/gemma4:e4b:ocr:v1",
    }));
    const enricher = createOcrEnricher(selectedRouter);
    const selectedPrefs = {
      ...prefs("gemma4"),
      mediaUnderstandingProvider: "lmstudio" as const,
      mediaUnderstandingModelId: "gemma4:e4b",
    };

    await expect(enricher.run(save(), selectedPrefs)).resolves.toEqual({
      derived: {
        ocrText: null,
        ocrModel: "lmstudio/gemma4:e4b:ocr:v1",
      },
      optimistic: {
        ocrText: null,
        ocrModel: "lmstudio/gemma4:e4b:ocr:v1",
      },
    });
    expect(selectedRouter.run).toHaveBeenCalledExactlyOnceWith({
      saveId: "save-1",
      imageUrl: "pond://save-1/image.png",
      task: "ocr",
      prefs: selectedPrefs,
    });
  });
});
