import { DEFAULT_PREFS } from "@pond/schema";
import type { Prefs } from "@pond/schema";
import { describe, expect, it, vi } from "vitest";
import type { Save } from "@/features/saves/types";
import { florenceModelVersion } from "../florence";
import type { MediaUnderstandingRouter } from "../media-understanding-router";
import { captionEnricher, createCaptionEnricher } from "./caption";

function prefs(mode: Prefs["ai"]["mediaUnderstandingMode"]): Prefs["ai"] {
  return { ...DEFAULT_PREFS.ai, mediaUnderstandingMode: mode };
}

function save(captionModel: string | null = null): Save {
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
    captionModel,
    savedAt: 1,
    createdAt: 1,
    deletedAt: null,
  };
}

function router(
  run: MediaUnderstandingRouter["run"] = async () => ({
    text: "A red bicycle.",
    model: "ollama/gemma4:e2b:caption:v1",
  }),
): MediaUnderstandingRouter {
  return {
    primaryModel: (task, ai) =>
      ai.mediaUnderstandingMode === "gemma4"
        ? `ollama/gemma4:e2b:${task}:v1`
        : "florence:v2",
    run,
  };
}

describe("caption enricher", () => {
  it("compares eligibility against the active primary model", () => {
    const enricher = createCaptionEnricher(router());

    expect(enricher.eligible(save("florence:v2"), prefs("florence"))).toBe(
      false,
    );
    expect(enricher.eligible(save("florence:v2"), prefs("gemma4"))).toBe(true);
    expect(
      enricher.eligible(save("ollama/gemma4:e2b:caption:v1"), prefs("gemma4")),
    ).toBe(false);
  });

  it("passes non-default preferences through the registered enricher", () => {
    expect(
      captionEnricher.eligible(save(florenceModelVersion()), prefs("florence")),
    ).toBe(false);
    expect(
      captionEnricher.eligible(save(florenceModelVersion()), prefs("gemma4")),
    ).toBe(true);
  });

  it("treats an unreadable-media skip as already processed", async () => {
    const selectedRouter = router(async () => ({
      text: "",
      model: "ollama/gemma4:e2b:caption:v1",
    }));
    const enricher = createCaptionEnricher(selectedRouter);
    const result = await enricher.run(save(), prefs("gemma4"));
    const stamped = {
      ...save(),
      ...result?.optimistic,
    };

    expect(enricher.eligible(stamped, prefs("gemma4"))).toBe(false);
  });

  it("persists the router output and model stamp", async () => {
    const selectedRouter = router();
    const run = vi.spyOn(selectedRouter, "run");
    const enricher = createCaptionEnricher(selectedRouter);

    await expect(enricher.run(save(), prefs("gemma4"))).resolves.toEqual({
      derived: {
        caption: "A red bicycle.",
        captionModel: "ollama/gemma4:e2b:caption:v1",
      },
      optimistic: {
        caption: "A red bicycle.",
        captionModel: "ollama/gemma4:e2b:caption:v1",
      },
    });
    expect(run).toHaveBeenCalledExactlyOnceWith({
      saveId: "save-1",
      imageUrl: "pond://save-1/image.png",
      task: "caption",
      prefs: prefs("gemma4"),
    });
  });

  it("does not manufacture a patch when the router fails", async () => {
    const selectedRouter = router(async () => {
      throw new Error("model_unavailable");
    });
    const enricher = createCaptionEnricher(selectedRouter);

    await expect(enricher.run(save(), prefs("gemma4"))).rejects.toThrow(
      "model_unavailable",
    );
  });
});
