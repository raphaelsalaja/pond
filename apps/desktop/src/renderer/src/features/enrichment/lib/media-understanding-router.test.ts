import { PrefsSchema } from "@pond/schema";
import type { MediaUnderstandResult } from "@shared/query-contracts-system";
import { describe, expect, it, vi } from "vitest";
import { createMediaUnderstandingRouter } from "./media-understanding-router";

describe("media understanding preferences", () => {
  it("keeps Florence as the backwards-compatible default", () => {
    const prefs = PrefsSchema.parse({});

    expect(prefs.ai.mediaUnderstandingMode).toBe("florence");
    expect(prefs.ai.mediaUnderstandingProvider).toBe("ollama");
    expect(prefs.ai.mediaUnderstandingModelId).toBe("gemma4:e2b");
  });

  it("reads the removed comparison mode as Florence", () => {
    const prefs = PrefsSchema.parse({
      ai: { mediaUnderstandingMode: "shadow" },
    });

    expect(prefs.ai.mediaUnderstandingMode).toBe("florence");
  });

  it("falls back field-by-field when stored values are invalid", () => {
    const prefs = PrefsSchema.parse({
      ai: {
        enableCaption: true,
        mediaUnderstandingMode: "removed-mode",
        mediaUnderstandingProvider: "cloud",
        mediaUnderstandingModelId: 42,
      },
    });

    expect(prefs.ai.enableCaption).toBe(true);
    expect(prefs.ai.mediaUnderstandingMode).toBe("florence");
    expect(prefs.ai.mediaUnderstandingProvider).toBe("ollama");
    expect(prefs.ai.mediaUnderstandingModelId).toBe("gemma4:e2b");
  });
});

function ai(
  mode: "florence" | "gemma4",
): ReturnType<typeof PrefsSchema.parse>["ai"] {
  return {
    ...PrefsSchema.parse({}).ai,
    mediaUnderstandingMode: mode,
    mediaUnderstandingProvider: "ollama",
    mediaUnderstandingModelId: "gemma4:e2b",
  };
}

function setup(
  result: MediaUnderstandResult = {
    ok: true,
    text: "Gemma caption",
    model: "ollama/gemma4:e2b:caption:v1",
  },
) {
  const runFlorence = vi.fn(async () => "Florence caption");
  const understandMedia = vi.fn(async () => result);
  const router = createMediaUnderstandingRouter({
    florenceModelVersion: () => "florence:v2",
    runFlorence,
    understandMedia,
  });
  return { router, runFlorence, understandMedia };
}

describe("media-understanding router", () => {
  it("uses Florence as the sole primary in Florence mode", async () => {
    const { router, runFlorence, understandMedia } = setup();

    await expect(
      router.run({
        saveId: "save-1",
        imageUrl: "pond://save-1/image.png",
        task: "caption",
        prefs: ai("florence"),
      }),
    ).resolves.toEqual({ text: "Florence caption", model: "florence:v2" });
    expect(runFlorence).toHaveBeenCalledExactlyOnceWith(
      "caption",
      "pond://save-1/image.png",
    );
    expect(understandMedia).not.toHaveBeenCalled();
  });

  it("uses and returns Gemma output in Gemma mode", async () => {
    const { router, runFlorence, understandMedia } = setup();

    await expect(
      router.run({
        saveId: "save-1",
        imageUrl: "pond://save-1/image.png",
        task: "caption",
        prefs: ai("gemma4"),
      }),
    ).resolves.toEqual({
      text: "Gemma caption",
      model: "ollama/gemma4:e2b:caption:v1",
    });
    expect(understandMedia).toHaveBeenCalledExactlyOnceWith(
      "save-1",
      "caption",
    );
    expect(runFlorence).not.toHaveBeenCalled();
  });

  it("surfaces a Gemma failure without running Florence", async () => {
    const { router, runFlorence } = setup({
      ok: false,
      reason: "model_unavailable",
    });

    await expect(
      router.run({
        saveId: "save-1",
        imageUrl: "pond://save-1/image.png",
        task: "caption",
        prefs: ai("gemma4"),
      }),
    ).rejects.toThrow("model_unavailable");
    expect(runFlorence).not.toHaveBeenCalled();
  });

  it("finishes unreadable media so the sweep does not retry it", async () => {
    const { router, runFlorence } = setup({
      ok: false,
      reason: "unsupported_media",
    });

    await expect(
      router.run({
        saveId: "save-1",
        imageUrl: "pond://save-1/clip.mp4",
        task: "caption",
        prefs: ai("gemma4"),
      }),
    ).resolves.toEqual({ text: "", model: "ollama/gemma4:e2b:caption:v1" });
    expect(runFlorence).not.toHaveBeenCalled();
  });

  it("stamps eligibility with the active primary model", () => {
    const { router } = setup();

    expect(router.primaryModel("ocr", ai("florence"))).toBe("florence:v2");
    expect(router.primaryModel("ocr", ai("gemma4"))).toBe(
      "ollama/gemma4:e2b:ocr:v1",
    );
  });
});
