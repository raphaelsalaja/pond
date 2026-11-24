import { Menu } from "@pond/ui";
import type { MenuItemSpec } from "@pond/ui";
import { isHTMLElement, isHTMLTag } from "@pond/ui/dom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpecMenu } from ".";

describe("spec menu search", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  function menuBody() {
    const body = document.querySelector("[data-menu-body]");
    const popup = body?.parentElement;
    if (!isHTMLElement(body) || !isHTMLElement(popup)) {
      throw new Error("Missing menu body");
    }
    return { body, popup };
  }

  function contentHeight(body: HTMLElement) {
    const content = body.firstElementChild;
    if (!isHTMLElement(content)) {
      throw new Error("Missing menu content");
    }
    const style = getComputedStyle(body);
    return (
      content.offsetHeight +
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom)
    );
  }

  async function open(
    items: Array<MenuItemSpec> = [
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
    if (!isHTMLElement(trigger)) {
      throw new Error("Missing trigger");
    }
    await act(async () => trigger.click());
  }

  it("sizes the operations list to its content height", async () => {
    await open();
    const { body, popup } = menuBody();
    await vi.waitFor(() =>
      expect(body.getAttribute("data-sized")).toBe("true"),
    );
    expect(body.style.getPropertyValue("--body-height")).toBe(
      `${contentHeight(body)}px`,
    );
    expect(popup.offsetWidth).toBeGreaterThanOrEqual(280);
    expect(popup.style.getPropertyValue("--popup-locked-width")).toBe(
      `${popup.offsetWidth}px`,
    );
    const positioner = popup.parentElement;
    expect(
      isHTMLElement(positioner)
        ? positioner.style.getPropertyValue("--ds-popup-min-width")
        : "",
    ).toBe("280px");
  });

  it("renders a plain full-width filter input", async () => {
    await open();
    const search = document.querySelector('[aria-label="Search operations"]');
    if (!isHTMLTag(search, "input")) {
      throw new Error("Missing search");
    }

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
    if (!isHTMLTag(search, "input")) {
      throw new Error("Missing search");
    }
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
    const { popup } = menuBody();
    await vi.waitFor(() =>
      expect(popup.style.getPropertyValue("--popup-locked-width")).not.toBe(""),
    );
    const lockedWidth = popup.style.getPropertyValue("--popup-locked-width");
    const search = document.querySelector('[aria-label="Search operations"]');
    if (!isHTMLTag(search, "input")) {
      throw new Error("Missing search");
    }
    await act(async () => {
      search.focus();
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(search, "zzz");
      search.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("No matching operations");
    const { body } = menuBody();
    expect(body.getAttribute("data-sized")).toBe("true");
    await vi.waitFor(() =>
      expect(body.style.getPropertyValue("--body-height")).toBe(
        `${contentHeight(body)}px`,
      ),
    );
    expect(contentHeight(body)).toBeGreaterThan(0);
    expect(popup.style.getPropertyValue("--popup-locked-width")).toBe(
      lockedWidth,
    );
  });
});
