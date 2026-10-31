import { DEFAULT_PREFS } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { processingSection } from "./config-processing";

const processingItems = () =>
  (processingSection.groups ?? []).flatMap((group) =>
    "items" in group ? (group.items ?? []) : [],
  );

describe("sensitive-content processing settings", () => {
  it("keeps blur visible but disabled until classification is enabled", () => {
    const blur = processingItems().find(
      (item) => item?.key === "blurSensitiveThumbnails",
    );
    if (blur?.control !== "switch") throw new Error("Missing blur switch");
    expect(blur.visible).toBeUndefined();
    expect(blur.disabled?.(DEFAULT_PREFS.ai)).toBe(true);
    expect(
      blur.disabled?.({
        ...DEFAULT_PREFS.ai,
        enableSensitiveContent: true,
      }),
    ).toBe(false);
  });

  it("does not expose implementation model choices", () => {
    const keys = processingItems().map((item) => item?.key);
    expect(keys).not.toContain("captionModelId");
    expect(keys).not.toContain("clipModelId");
    expect(keys).not.toContain("whisperModelId");
  });

  it("lets users choose the image model, runtime, and exact installed model ID", () => {
    const items = processingItems();
    const mode = items.find((item) => item?.key === "mediaUnderstandingMode");
    const provider = items.find(
      (item) => item?.key === "mediaUnderstandingProvider",
    );
    const model = items.find(
      (item) => item?.key === "media-understanding-model-id",
    );

    expect(mode).toMatchObject({
      control: "select",
      title: "Image Understanding",
      options: [
        { value: "florence", label: "Built-In Model" },
        { value: "gemma4", label: "Local Runtime Model" },
      ],
    });
    expect(provider).toMatchObject({
      control: "select",
      title: "Local Runtime",
      options: [
        { value: "ollama", label: "Ollama" },
        { value: "lmstudio", label: "LM Studio" },
      ],
    });
    expect(model).toMatchObject({
      control: "custom",
      title: "Local Model ID",
    });
    expect(provider?.visible?.(DEFAULT_PREFS.ai)).toBe(false);
    expect(model?.visible?.(DEFAULT_PREFS.ai)).toBe(false);
    const gemma = {
      ...DEFAULT_PREFS.ai,
      mediaUnderstandingMode: "gemma4" as const,
    };
    expect(provider?.visible?.(gemma)).toBe(true);
    expect(model?.visible?.(gemma)).toBe(true);
  });

  it("saves an exact installed model ID", async () => {
    const model = processingItems().find(
      (item) => item?.key === "media-understanding-model-id",
    );
    if (model?.control !== "custom")
      throw new Error("Missing local model ID control");
    const patch = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          model.render({
            loaded: true,
            values: DEFAULT_PREFS.ai,
            patch,
          }),
        ),
      );
      const input = host.querySelector("input");
      if (!input) throw new Error("Missing local model ID input");
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set?.call(input, "gemma4:custom-vision");
        input.dispatchEvent(new InputEvent("input", { bubbles: true }));
      });
      await act(async () => {
        input.focus();
        input.blur();
      });
      expect(patch).toHaveBeenLastCalledWith({
        mediaUnderstandingModelId: "gemma4:custom-vision",
      });
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
