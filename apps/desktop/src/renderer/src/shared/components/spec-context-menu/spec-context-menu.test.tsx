import { Menu, type MenuItemSpec } from "@pond/ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpecMenu } from ".";

describe("spec menu search", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return 240;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get() {
        return 280;
      },
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  async function open(
    items: MenuItemSpec[] = [
      { label: "Open Save", onClick: () => {} },
      { label: "Reveal in Finder", onClick: () => {} },
    ],
  ) {
    await act(async () =>
      root.render(
        <SpecMenu search minWidth="280px" buildItems={() => items}>
          <Menu.Trigger>Open</Menu.Trigger>
        </SpecMenu>,
      ),
    );
    const trigger = document.querySelector("button");
    if (!(trigger instanceof HTMLElement)) throw new Error("Missing trigger");
    await act(async () => trigger.click());
  }

  it("sizes the operations list to its content height", async () => {
    await open();
    const body = document.querySelector("[data-menu-body]");
    expect(body?.getAttribute("data-sized")).toBe("true");
    expect(
      body instanceof HTMLElement
        ? body.style.getPropertyValue("--body-height")
        : "",
    ).toBe("240px");
    const popup = body?.parentElement;
    expect(
      popup instanceof HTMLElement
        ? popup.style.getPropertyValue("--popup-locked-width")
        : "",
    ).toBe("280px");
    const positioner = popup?.parentElement;
    expect(
      positioner instanceof HTMLElement
        ? positioner.style.getPropertyValue("--ds-popup-min-width")
        : "",
    ).toBe("280px");
  });

  it("renders a plain full-width filter input", async () => {
    await open();
    const search = document.querySelector('[aria-label="Search operations"]');
    if (!(search instanceof HTMLInputElement))
      throw new Error("Missing search");

    expect({
      type: search.type,
      role: search.getAttribute("role"),
      placeholder: search.placeholder,
      parentRole: search.parentElement?.getAttribute("role"),
      hasIcon: search.parentElement?.querySelector("svg") !== null,
    }).toEqual({
      type: "text",
      role: "searchbox",
      placeholder: "Search…",
      parentRole: "dialog",
      hasIcon: false,
    });
  });

  it("renders a submenu search match as one breadcrumb row", async () => {
    await open([
      {
        type: "submenu",
        label: "Export",
        items: [{ label: "Export Converted Files", onClick: () => {} }],
      },
    ]);
    const search = document.querySelector('[aria-label="Search operations"]');
    if (!(search instanceof HTMLInputElement))
      throw new Error("Missing search");
    await act(async () => {
      search.focus();
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(search, "converted");
      search.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });

    const body = document.querySelector("[data-menu-body]");
    const row = body?.querySelector('[role="menuitem"]');
    expect(row?.querySelector("[data-menu-breadcrumb]")?.textContent).toBe(
      "Export",
    );
    expect(
      row?.querySelector("[data-menu-breadcrumb-current]")?.textContent,
    ).toBe("Export Converted Files");
  });

  it("keeps a sized height when the query matches nothing", async () => {
    await open();
    const search = document.querySelector('[aria-label="Search operations"]');
    if (!(search instanceof HTMLInputElement))
      throw new Error("Missing search");
    await act(async () => {
      search.focus();
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(search, "zzz");
      search.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("No matching operations");
    const body = document.querySelector("[data-menu-body]");
    expect(body?.getAttribute("data-sized")).toBe("true");
    expect(
      body instanceof HTMLElement
        ? body.style.getPropertyValue("--body-height")
        : "",
    ).toBe("240px");
    const popup = body?.parentElement;
    expect(
      popup instanceof HTMLElement
        ? popup.style.getPropertyValue("--popup-locked-width")
        : "",
    ).toBe("280px");
  });
});
