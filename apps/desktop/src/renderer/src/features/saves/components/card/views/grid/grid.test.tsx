import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { SaveCardModel } from "@/features/saves/components/card/model";
import { normalise, SavePatchSchema } from "@/features/saves/lib/reconcile";
import { GridCard } from "./";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("GridCard", () => {
  it("fits the preview inside a separate badge container", () => {
    const save = normalise(
      SavePatchSchema.parse({ id: "grid-card", url: "https://example.com" }),
    );
    if (!save) throw new Error("Fixture must produce a save");
    const model: SaveCardModel = {
      save,
      unit: null,
      primary: null,
      mediaUnits: [],
      pickOptions: {},
      aspect: 0.5,
      title: null,
      time: null,
      overlay: {
        type: { label: "PNG", kind: "image" },
        source: null,
        fileCount: null,
      },
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(<GridCard model={model} width={200} />));

    const frame = container.querySelector<HTMLElement>(
      '[style*="--frame-aspect"]',
    );
    const badge = container.querySelector('[aria-label="Type: PNG"]');
    const overlay = badge?.parentElement;
    const media = overlay?.parentElement;

    expect(frame?.style.getPropertyValue("--frame-aspect")).toBe("0.5");
    expect(frame?.style.getPropertyValue("--frame-width")).toBe("50%");
    expect(frame?.parentElement).toBe(media);
    expect(overlay?.previousElementSibling).toBe(frame);
    expect(frame?.contains(overlay ?? null)).toBe(false);
  });
});
