import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { newMenuDialog } from "@/features/library/state/new-menu-dialog";
import { bridge } from "@/shared/test/pond-bridge";
import { NewMenu, NewMenuDialogHost } from "./";

const labels = ["New", "Import", "Sources", "Library"];

describe("new menu", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    bridge.use({
      query: {
        "saves.listBlankDocuments": () => ({ kinds: [], icons: {} }),
      },
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    newMenuDialog.close();
    await act(async () => root.unmount());
    host.remove();
  });

  async function openMenu() {
    await act(async () => root.render(<NewMenu />));
    const trigger = document.querySelector<HTMLElement>('[aria-label="New"]');
    if (!trigger) {
      throw new Error("Missing New");
    }
    await act(async () => trigger.click());
  }

  it("groups actions into task submenus", async () => {
    await openMenu();
    const text = document.body.textContent ?? "";
    for (const label of labels) {
      expect(text).toContain(label);
    }
    expect(text).not.toContain("New Folder");
    expect(text).not.toContain("Import Files");
    expect(text).not.toContain("Navigate");
    expect(text).not.toContain("New Tab");
    expect(text).not.toContain("Create");
    expect(text).not.toContain("Connect");
    expect(text).not.toContain("Tools");
  });

  it("uses an outline icon for the Sources submenu", async () => {
    await openMenu();
    const item = [...document.querySelectorAll('[role="menuitem"]')].find(
      (el) => el.textContent?.includes("Sources"),
    );
    const icon = item?.querySelector("svg");
    expect(icon).toBeTruthy();
    expect(icon?.getAttribute("stroke")).toBe("currentColor");
    expect(icon?.getAttribute("fill")).toBe("none");
  });

  it("filters by search and reports no matches", async () => {
    await openMenu();
    const search = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search Actions"]',
    );
    if (!search) {
      throw new Error("Missing search");
    }
    await act(async () => {
      search.focus();
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(search, "eagle");
      search.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("Import Eagle Library");
    expect(document.body.textContent).not.toContain("New Folder");

    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(search, "zzzz");
      search.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("No matches");
  });

  it("hosts the links dialog from the shared store", async () => {
    await act(async () => root.render(<NewMenuDialogHost />));
    await act(async () => newMenuDialog.open({ kind: "links" }));
    expect(document.body.textContent).toContain("Import from Links");
    const links = document.querySelector("textarea");
    if (!links) {
      throw new Error("Missing links field");
    }
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set?.call(links, "https://example.test");
      links.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    await act(async () => newMenuDialog.close());
    await act(async () => newMenuDialog.open({ kind: "links" }));
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "https://example.test",
    );
  });
});
