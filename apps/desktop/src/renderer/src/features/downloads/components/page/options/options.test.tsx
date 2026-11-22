import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadsColumnsLayout } from "@/features/downloads/state/downloads-columns";
import { DownloadOptionsMenu } from "./";

describe("download options", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    downloadsColumnsLayout.reset();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    downloadsColumnsLayout.reset();
    vi.unstubAllGlobals();
  });

  it("keeps sort and display properties together", async () => {
    await act(async () => root.render(<DownloadOptionsMenu />));
    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('[aria-label="Options"]')
        ?.click();
    });
    const text = document.body.textContent ?? "";
    expect(text).toContain("Sort By");
    expect(text).toContain("Display Properties");
    expect(text).not.toContain("Reset");
    expect(text).not.toContain("Columns");

    const status = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Status",
    );
    expect(status?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => status?.click());
    expect(downloadsColumnsLayout.snapshot().hidden).toContain("stage");
    expect(status?.getAttribute("aria-pressed")).toBe("false");
  });
});
