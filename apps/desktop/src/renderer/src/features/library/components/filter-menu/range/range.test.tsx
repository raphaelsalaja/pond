import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomFilter } from "./";

describe("custom filter controls", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  async function fill(index: number, value: string) {
    const input = host.querySelectorAll("input")[index];
    if (!input) throw new Error("Missing filter input");
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("includes the entire final day in a custom date range", async () => {
    const onApply = vi.fn();
    await act(async () =>
      root.render(<CustomFilter field="savedAt" onApply={onApply} />),
    );
    expect(host.querySelector('button[type="submit"]')).toBeNull();
    await fill(0, "2026-08-01");
    await fill(1, "2026-08-30");

    await act(
      async () =>
        new Promise((resolve) => {
          setTimeout(resolve, 300);
        }),
    );
    const last = new Date("2026-08-31T00:00:00");
    last.setMilliseconds(-1);
    expect(onApply).toHaveBeenCalledWith({
      field: "savedAt",
      operator: "between",
      value: [
        new Date("2026-08-01T00:00:00").toISOString(),
        last.toISOString(),
      ],
    });
  });

  it("does not apply a reversed date range", async () => {
    const onApply = vi.fn();
    await act(async () =>
      root.render(<CustomFilter field="savedAt" onApply={onApply} />),
    );
    await fill(0, "2026-08-30");
    await fill(1, "2026-08-01");
    expect(host.querySelector('button[type="submit"]')).toBeNull();
    await act(
      async () =>
        new Promise((resolve) => {
          setTimeout(resolve, 300);
        }),
    );
    expect(onApply).not.toHaveBeenCalled();
  });

  it("applies duration values in seconds", async () => {
    const onApply = vi.fn();
    await act(async () =>
      root.render(<CustomFilter field="duration" onApply={onApply} />),
    );
    await fill(0, "90");
    await act(
      async () =>
        new Promise((resolve) => {
          setTimeout(resolve, 300);
        }),
    );
    expect(onApply).toHaveBeenCalledWith({
      field: "duration",
      operator: "gte",
      value: 90,
    });
  });

  it("shows a size unit and converts kilobytes to stored bytes", async () => {
    const onApply = vi.fn();
    await act(async () =>
      root.render(<CustomFilter field="fileSize" onApply={onApply} />),
    );
    expect(
      host.querySelector('[role="combobox"][aria-label="Size Unit"]')
        ?.textContent,
    ).toBe("KB");
    await fill(0, "2");
    await act(
      async () =>
        new Promise((resolve) => {
          setTimeout(resolve, 300);
        }),
    );
    expect(onApply).toHaveBeenCalledWith({
      field: "fileSize",
      operator: "gte",
      value: 2048,
    });
  });

  it("does not change a strict duration boundary when applying unchanged values", async () => {
    const onApply = vi.fn();
    const current = {
      field: "duration" as const,
      operator: "lt" as const,
      value: 30,
    };
    await act(async () =>
      root.render(
        <CustomFilter field="duration" current={current} onApply={onApply} />,
      ),
    );
    expect(host.querySelector('input[aria-label="Less Than"]')).not.toBeNull();
    await act(
      async () =>
        new Promise((resolve) => {
          setTimeout(resolve, 300);
        }),
    );
    await act(async () => {
      host
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    expect(onApply).toHaveBeenCalledWith(current);
  });
});
