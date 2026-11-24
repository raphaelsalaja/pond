import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sourceFlow } from "@/features/sources/state/source-flow";
import { SourceFlowHost } from ".";

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
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function button(label: string) {
  const found = Array.from(document.querySelectorAll("button")).find(
    (element) =>
      element.textContent === label ||
      element.getAttribute("aria-label") === label,
  );
  if (!found) {
    throw new Error(`Missing button: ${label}`);
  }
  return found;
}

it.each(["close", "escape", "back"] as const)(
  "releases the source overlay after %s clears its page stack",
  async (dismiss) => {
    await act(async () => root.render(<SourceFlowHost />));
    await act(async () => sourceFlow.open("connect-wait"));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(
      document
        .querySelector('[role="dialog"] header')
        ?.hasAttribute("data-empty"),
    ).toBe(true);
    await act(async () => {
      if (dismiss === "close") {
        button("Cancel").click();
      } else if (dismiss === "back") {
        sourceFlow.back();
      } else {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      }
    });
    expect(sourceFlow.current()).toBeNull();
    expect(document.querySelector('[role="presentation"]')).toBeNull();
    expect(document.querySelector("[data-base-ui-inert]")).toBeNull();
    await act(async () => sourceFlow.open("connect-wait"));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "Add Connection",
    );
    await act(async () => button("Cancel").click());
    expect(document.querySelector('[role="presentation"]')).toBeNull();
  },
);
