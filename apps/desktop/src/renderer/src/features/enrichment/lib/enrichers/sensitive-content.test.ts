import { DEFAULT_PREFS } from "@pond/schema";
import {
  MANUAL_LIKELY_SENSITIVE_MODEL,
  MANUAL_NOT_SENSITIVE_MODEL,
} from "@pond/schema/content-safety";
import { describe, expect, it } from "vitest";
import type { Save } from "@/features/saves/types";
import { SENSITIVE_CONTENT_MODEL_VERSION } from "../sensitive-content";
import { sensitiveContentEnricher } from "./sensitive-content";

function imageSave(sensitiveModel: string | null = null): Save {
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
    files: [
      {
        kind: "media",
        path: "image.jpg",
        sha256: "hash",
        size: 1,
        mimeType: "image/jpeg",
      },
    ],
    tags: [],
    status: "complete",
    sensitiveModel,
    savedAt: 1,
    createdAt: 1,
    deletedAt: null,
  };
}

describe("sensitive content enricher", () => {
  it("is eligible until the current policy version is stamped", () => {
    expect(sensitiveContentEnricher.eligible(imageSave())).toBe(true);
    expect(sensitiveContentEnricher.eligible(imageSave("retired-model"))).toBe(
      true,
    );
    expect(
      sensitiveContentEnricher.eligible(
        imageSave(SENSITIVE_CONTENT_MODEL_VERSION),
      ),
    ).toBe(false);
  });

  it("does not reclassify a Save the user corrected", () => {
    const cleared = imageSave(MANUAL_NOT_SENSITIVE_MODEL);
    cleared.sensitiveScore = 0;
    const marked = imageSave(MANUAL_LIKELY_SENSITIVE_MODEL);
    marked.sensitiveScore = 1;
    expect(sensitiveContentEnricher.eligible(cleared)).toBe(false);
    expect(sensitiveContentEnricher.eligible(marked)).toBe(false);
  });

  it("never scores the rendered card of a text-only post", async () => {
    const textOnly: Save = {
      ...imageSave(),
      source: "twitter",
      files: [
        {
          kind: "tweet_screenshot_light",
          path: "tweet-light.png",
          sha256: "hash",
          size: 1,
          mimeType: "image/png",
        },
      ],
    };
    expect(sensitiveContentEnricher.eligible(textOnly)).toBe(false);
    expect(
      sensitiveContentEnricher.eligible({
        ...textOnly,
        sensitiveScore: 0,
        sensitiveModel: MANUAL_NOT_SENSITIVE_MODEL,
      }),
    ).toBe(false);

    const scored = {
      ...textOnly,
      sensitiveScore: 0.4,
      sensitiveModel: "retired-model",
    };
    expect(sensitiveContentEnricher.eligible(scored)).toBe(true);
    const cleared = { sensitiveScore: null, sensitiveModel: null };
    await expect(sensitiveContentEnricher.run(scored)).resolves.toEqual({
      derived: cleared,
      optimistic: cleared,
    });
  });

  it("only runs when sensitive-content processing is enabled", () => {
    expect(
      sensitiveContentEnricher.enabled({
        ...DEFAULT_PREFS,
        ai: { ...DEFAULT_PREFS.ai, enableSensitiveContent: true },
      }),
    ).toBe(true);
    expect(sensitiveContentEnricher.enabled(null)).toBe(false);
  });
});
