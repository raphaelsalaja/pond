import type { ConversionJob } from "@shared/conversion-contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  closeConversionDialog,
  openConversionDialog,
} from "@/features/library/state/conversion-dialog";
import { ConversionDialogHost } from "./host";

it("opens the consolidated export dialog on original files without conversion fields", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      openConversionDialog(["a"], 0, "files");
      root.render(<ConversionDialogHost />);
    });
    await vi.waitFor(
      async () => {
        await act(async () => {});
        expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      },
      { timeout: 5000 },
    );
    expect(document.body.textContent).toContain("Export Type");
    expect(document.body.textContent).toContain("Original Files");
    expect(document.body.textContent).not.toContain("Preset Name");
    expect(document.body.textContent).not.toContain("Quality");
    expect(document.body.textContent).toContain("Export");
  } finally {
    await act(() => {
      closeConversionDialog();
      root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("saves a preset from a popover inside the export dialog", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const saved: unknown[] = [];
  vi.stubGlobal("pond", {
    query: async (name: string, input: { preset?: unknown }) => {
      if (name === "conversion.presets") return [];
      if (name === "conversion.capabilities") return [];
      if (name === "conversion.savePreset") {
        saved.push(input.preset);
        return input.preset;
      }
      throw new Error(`Unexpected ${name}`);
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      openConversionDialog(["a"]);
      root.render(<ConversionDialogHost />);
    });
    const trigger = await vi.waitFor(
      async () => {
        await act(async () => {});
        const element = [...document.querySelectorAll("button")].find(
          (button) => button.textContent === "Save Preset",
        );
        if (!element) throw new Error("Missing Save Preset");
        return element;
      },
      { timeout: 5000 },
    );
    await act(async () => trigger.click());
    const field = await vi.waitFor(() => {
      const label = [...document.querySelectorAll("label")].find(
        (element) => element.textContent === "Preset Name",
      );
      const input = label?.htmlFor
        ? document.getElementById(label.htmlFor)
        : null;
      if (!(input instanceof HTMLInputElement))
        throw new Error("Missing preset name field");
      return input;
    });
    const form = field.form;
    if (!form) throw new Error("Missing preset form");
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setValue?.call(field, "  ");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => form.requestSubmit());
    expect(saved).toHaveLength(0);
    expect(document.body.textContent).toContain("Name the preset to save it.");
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setValue?.call(field, "Thumbnails");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => form.requestSubmit());
    expect(saved).toEqual([expect.objectContaining({ name: "Thumbnails" })]);
  } finally {
    await act(() => {
      closeConversionDialog();
      root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("shows conversion progress and cancellation while preserving completed output information", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const job: ConversionJob = {
    id: "job",
    kind: "export",
    status: "running",
    completed: 1,
    total: 2,
    progress: 0.5,
    currentId: "b",
    directory: "/export",
    outputs: ["/export/one.webp"],
    changed: 1,
    skipped: 0,
    failed: 0,
    bytesBefore: 0,
    bytesAfter: 0,
    error: null,
  };
  const calls: string[] = [];
  vi.stubGlobal("pond", {
    query: async (name: string) => {
      calls.push(name);
      if (name === "conversion.presets") return [];
      if (name === "conversion.capabilities")
        return [
          {
            format: "webp",
            category: "image",
            adapter: "sharp",
            extension: "webp",
            mimeType: "image/webp",
            available: true,
            unavailableReason: null,
            supportsLossless: true,
          },
        ];
      if (name === "conversion.start" || name === "conversion.status")
        return job;
      if (name === "conversion.cancel") return { ...job, status: "cancelled" };
      throw new Error(`Unexpected ${name}`);
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function button(label: string) {
    const element = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === label,
    );
    if (!element) throw new Error(`Missing ${label}`);
    return element;
  }
  try {
    await act(async () => {
      openConversionDialog(["a", "b"]);
      root.render(<ConversionDialogHost />);
    });
    await vi.waitFor(
      async () => {
        await act(async () => {});
        expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      },
      { timeout: 5000 },
    );
    const lossless = document.querySelector('[role="checkbox"]');
    if (!(lossless instanceof HTMLElement))
      throw new Error("Missing lossless checkbox");
    expect(lossless.getAttribute("aria-checked")).toBe("false");
    await act(async () => lossless.click());
    expect(lossless.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('input[type="range"]')).toHaveProperty(
      "value",
      "85",
    );
    expect(document.body.textContent).toContain("Export Type");
    expect(document.body.textContent).toContain("Converted Files");
    await act(async () => button("Export").click());
    expect(document.querySelector("progress")?.value).toBe(0.5);
    expect(document.body.textContent).toContain("Exporting: 1 of 2 files.");
    await act(async () => button("Cancel").click());
    expect(document.body.textContent).toContain("Export Canceled");
    expect(document.body.textContent).toContain("Completed files remain");
    expect(calls).toContain("conversion.cancel");
  } finally {
    await act(() => {
      closeConversionDialog();
      root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
  }
});
