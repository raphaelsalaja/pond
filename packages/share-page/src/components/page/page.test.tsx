import type { SharePageManifest, SharePageSave } from "@pond/schema/share-page";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PAGE_SIZE, Page } from ".";

const SAVE: Pick<SharePageSave, "source" | "media"> = {
  source: "Instagram",
  media: [],
};

function manifest(
  overrides: Partial<SharePageManifest> = {},
): SharePageManifest {
  return {
    version: 1,
    kind: "folder",
    title: "References",
    createdAt: "2026-11-27T12:00:00.000Z",
    saves: [
      {
        ...SAVE,
        id: "s1",
        title: "Morning light",
        url: "https://example.com/p/1",
        author: { name: "A. Photographer", handle: "aphotographer" },
        thumbnail: { src: "media/s1-thumb.webp", width: 720, height: 900 },
      },
      { ...SAVE, id: "s2", title: "Second", text: "Body text" },
    ],
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(value: SharePageManifest) {
  act(() => root.render(<Page manifest={value} />));
}

describe("Page", () => {
  it("lists a Folder's Saves under its name", () => {
    render(manifest());
    expect(container.querySelector("h1")?.textContent).toBe("References");
    expect(container.textContent).toContain("2 Saves");
    const cards = container.querySelectorAll("button[data-save]");
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain("Instagram · A. Photographer");
  });

  it("shows a single Save as the page itself", () => {
    render(manifest({ kind: "save", saves: manifest().saves.slice(0, 1) }));
    expect(container.querySelector("h1")?.textContent).toBe("Morning light");
    expect(container.querySelector("button[data-save]")).toBeNull();
  });

  it("opens links to other sites without a referrer", () => {
    render(manifest({ kind: "save", saves: manifest().saves.slice(0, 1) }));
    const original = [...container.querySelectorAll("a")].find(
      (link) => link.textContent === "Open Original",
    );
    expect(original?.getAttribute("href")).toBe("https://example.com/p/1");
    expect(original?.getAttribute("rel")).toBe("noreferrer noopener");
  });

  it("shows notes and tags only when the manifest has them", () => {
    const base = manifest().saves[0];
    if (!base) throw new Error("fixture");
    render(manifest({ kind: "save", saves: [base] }));
    expect(container.querySelector('[aria-label="Notes"]')).toBeNull();
    expect(container.querySelector('[aria-label="Tags"]')).toBeNull();

    render(
      manifest({
        kind: "save",
        saves: [{ ...base, notes: "Private thought", tags: ["light"] }],
      }),
    );
    expect(container.querySelector('[aria-label="Notes"]')?.textContent).toBe(
      "Private thought",
    );
    expect(container.querySelector('[aria-label="Tags"]')?.textContent).toBe(
      "light",
    );
  });

  it("opens a Save from the card and records it in the address", () => {
    render(manifest());
    const card = container.querySelector<HTMLButtonElement>('[data-save="s2"]');
    act(() => card?.click());
    expect(window.location.hash).toBe("#s2");
    expect(container.querySelector("dialog h2")?.textContent).toBe("Second");
    expect(container.querySelector("dialog")?.textContent).toContain("2 of 2");
  });

  it("opens the Save the address points at", () => {
    window.history.replaceState(null, "", "/#s1");
    render(manifest());
    expect(container.querySelector("dialog h2")?.textContent).toBe(
      "Morning light",
    );
  });

  it("pages a large Folder", () => {
    const many = Array.from({ length: PAGE_SIZE + 5 }, (_, index) => ({
      ...SAVE,
      id: `s${index + 1}`,
      title: `Save ${index + 1}`,
    }));
    render(manifest({ saves: many }));
    expect(container.querySelectorAll("button[data-save]")).toHaveLength(
      PAGE_SIZE,
    );
    const more = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Show More",
    );
    act(() => more?.click());
    expect(container.querySelectorAll("button[data-save]")).toHaveLength(
      PAGE_SIZE + 5,
    );
  });
});
