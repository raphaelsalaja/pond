import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getViewState,
  restoreDefaults,
} from "@/features/library/state/view-store";
import { ZoomSection } from ".";

describe("zoom section", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    restoreDefaults();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    restoreDefaults();
  });

  it("picks a thumbnail size from the select", async () => {
    await act(async () => root.render(<ZoomSection />));
    await act(async () => {
      host.querySelector<HTMLElement>("[role='combobox']")?.click();
    });
    await act(async () => {
      [...document.querySelectorAll<HTMLElement>("[role='option']")]
        .find((node) => node.textContent === "Large")
        ?.click();
    });
    expect(getViewState().zoom).toBe(155);
  });
});
