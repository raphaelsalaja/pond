import { DEFAULT_PREFS } from "@pond/schema";
import { RouterProvider } from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLibraryTestRouter,
  currentLocation,
  openLibraryAt,
} from "@/app/test/library-router";
import { setLibrarySaveGap } from "@/features/library/components/layouts/save-gap";
import { folders } from "@/features/library/state/folders";
import { bridge } from "@/shared/test/pond-bridge";
import { wireSave } from "@/shared/test/wire-save";
import { FolderBrowser } from ".";

const folderRows = [
  {
    id: "child",
    parentId: "root",
    name: "Reference",
    color: null,
    sortOrder: 0,
    createdAt: new Date(0),
  },
  {
    id: "nested",
    parentId: "child",
    name: "Nested",
    color: null,
    sortOrder: 0,
    createdAt: new Date(0),
  },
];

const previewRows = [
  wireSave({
    id: "preview-a",
    source: "local",
    sourceId: "preview-a",
    url: "pond:local/preview-a",
    title: "contents",
    mediaType: "text",
    files: [
      {
        kind: "thumbnail",
        path: "thumbnail.png",
        mimeType: "image/png",
        sha256: "abcdef1234567890",
        size: 10,
      },
    ],
    tags: [],
    savedAt: 2,
    createdAt: 2,
  }),
  wireSave({
    id: "preview-b",
    source: "local",
    sourceId: "preview-b",
    url: "pond:local/preview-b",
    title: "metadata",
    mediaType: "file",
    files: [
      {
        kind: "file",
        path: "metadata.plist",
        mimeType: "application/octet-stream",
        sha256: "abcdef1234567890",
        size: 10,
      },
    ],
    tags: [],
    savedAt: 1,
    createdAt: 1,
  }),
];

describe("folder browser", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    bridge.use({
      query: {
        "folders.list": () => folderRows,
        "folders.memberships": () => [],
        "settings.getPrefs": () => DEFAULT_PREFS,
        "folders.summaries": () => [
          {
            id: "child",
            directSaveCount: 3,
            downloadingCount: 0,
            childFolderCount: 1,
            previewSaveIds: [
              "preview-a",
              "preview-b",
              "preview-c",
              "preview-d",
            ],
          },
        ],
        "saves.getMany": () => [],
      },
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await folders.refresh();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    setLibrarySaveGap(16);
  });

  it("shows child folders separately from contents", async () => {
    setLibrarySaveGap(0);
    await act(async () => {
      root.render(
        <FolderBrowser parentId="root" contentCount={3}>
          {() => <div>Save grid</div>}
        </FolderBrowser>,
      );
    });
    await vi.waitFor(() =>
      expect(host.textContent).toContain("3 items · 1 subfolder"),
    );
    expect(host.textContent).toContain("Subfolders (1)");
    expect(host.textContent).toContain("Contents (3)");
    expect(host.textContent).toContain("Save grid");
    expect(host.querySelector("ul")?.style.gap).toBe("0px");
    expect(window.pond.query).toHaveBeenCalledWith("saves.getMany", {
      ids: ["preview-a", "preview-b", "preview-c", "preview-d"],
    });
  });

  it("shows up to four item previews, including files that need a generated thumbnail", async () => {
    bridge.use({
      query: {
        "folders.summaries": () => [
          {
            id: "child",
            directSaveCount: 2,
            downloadingCount: 0,
            childFolderCount: 0,
            previewSaveIds: ["preview-a", "preview-b"],
          },
        ],
        "saves.getMany": () => previewRows,
      },
    });
    await act(async () => {
      root.render(<FolderBrowser parentId="root" contentCount={0} />);
    });
    const images = await vi.waitFor(() => {
      const found = [...host.querySelectorAll<HTMLImageElement>("img")];
      expect(found).toHaveLength(2);
      return found;
    });
    expect(images.map((image) => image.getAttribute("src"))).toEqual([
      expect.stringContaining("thumbnail.png"),
      expect.stringContaining("preview="),
    ]);
    expect(images[1]?.getAttribute("src")).toContain("metadata.plist");
    expect(images[0]?.getAttribute("data-fit")).toBe("fit");
  });

  it("labels an empty folder as 0 items and keeps the folder cover", async () => {
    bridge.use({
      query: {
        "folders.list": () => [
          {
            id: "empty",
            parentId: "root",
            name: "resources",
            color: null,
            sortOrder: 0,
            createdAt: new Date(0),
          },
        ],
        "folders.summaries": () => [
          {
            id: "empty",
            directSaveCount: 0,
            downloadingCount: 0,
            childFolderCount: 0,
            previewSaveIds: [],
          },
        ],
      },
    });
    await folders.refresh();
    await act(async () => {
      root.render(<FolderBrowser parentId="root" contentCount={0} />);
    });
    const button = await vi.waitFor(() => {
      const candidate = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Open resources, 0 items"]',
      );
      expect(candidate).not.toBeNull();
      return candidate;
    });
    expect(button?.textContent).toContain("0 items");
    expect(button?.querySelector("svg")).not.toBeNull();
    expect(button?.querySelector("img")).toBeNull();
    expect(button?.textContent).not.toContain("Empty");
  });

  it("labels a folder whose saves are still downloading", async () => {
    bridge.use({
      query: {
        "folders.list": () => [
          {
            id: "board",
            parentId: "root",
            name: "Kitchens",
            color: null,
            sortOrder: 0,
            createdAt: new Date(0),
          },
        ],
        "folders.summaries": () => [
          {
            id: "board",
            directSaveCount: 0,
            downloadingCount: 12,
            childFolderCount: 0,
            previewSaveIds: [],
          },
        ],
      },
    });
    await folders.refresh();
    const router = createLibraryTestRouter("/", {
      component: () => (
        <FolderBrowser parentId="root" contentCount={0} downloading={12} />
      ),
    });
    await act(async () => {
      await router.load();
      root.render(<RouterProvider router={router} />);
    });
    const button = await vi.waitFor(() => {
      const candidate = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Open Kitchens, 12 downloading"]',
      );
      expect(candidate).not.toBeNull();
      return candidate;
    });
    expect(button?.textContent).not.toContain("0 items");
    const status = host.querySelector('[role="status"]');
    expect(status?.textContent).toContain("Downloading 12 saves");
    expect(status?.querySelector('a[role="link"]')?.getAttribute("href")).toBe(
      "/downloads",
    );
    expect(host.textContent).toContain("Contents (0)");
  });

  it("leaves the contents header alone when nothing is downloading", async () => {
    await act(async () => {
      root.render(
        <FolderBrowser parentId="root" contentCount={3}>
          {() => <div>Save grid</div>}
        </FolderBrowser>,
      );
    });
    await vi.waitFor(() => expect(host.textContent).toContain("Contents (3)"));
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.textContent).not.toContain("Downloading");
  });

  it("hands the Contents header to the grid below expanded pinned Saves", async () => {
    await act(async () => {
      root.render(
        <FolderBrowser
          parentId="root"
          contentCount={3}
          pinned={{ count: 2, collapsed: false, onToggle: () => {} }}
        >
          {(header) => <div data-grid="">{header}</div>}
        </FolderBrowser>,
      );
    });
    const toggle = host.querySelector<HTMLButtonElement>(
      "#pinned-title button",
    );
    expect(toggle?.textContent).toBe("Pinned (2)");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelectorAll("#contents-title")).toHaveLength(1);
    expect(host.querySelector("[data-grid] #contents-title")?.textContent).toBe(
      "Contents (3)",
    );
  });

  it("keeps the Contents header above the grid while pinned Saves are collapsed", async () => {
    const onToggle = vi.fn();
    await act(async () => {
      root.render(
        <FolderBrowser
          parentId="root"
          contentCount={3}
          pinned={{ count: 2, collapsed: true, onToggle }}
        >
          {(header) => <div data-grid="">{header}</div>}
        </FolderBrowser>,
      );
    });
    const toggle = host.querySelector<HTMLButtonElement>(
      "#pinned-title button",
    );
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector("[data-grid]")?.childElementCount).toBe(0);
    expect(host.querySelector("#contents-title")?.textContent).toBe(
      "Contents (3)",
    );
    await act(async () => toggle?.click());
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("drops the Contents header when every Save is pinned", async () => {
    await act(async () => {
      root.render(
        <FolderBrowser
          parentId="root"
          contentCount={0}
          pinned={{ count: 4, collapsed: false, onToggle: () => {} }}
        >
          {(header) => <div data-grid="">{header}</div>}
        </FolderBrowser>,
      );
    });
    expect(host.textContent).toContain("Pinned (4)");
    expect(host.querySelector("#contents-title")).toBeNull();
  });

  it("opens a child folder with the keyboard-accessible card button", async () => {
    const router = await openLibraryAt("/");
    await act(async () => {
      root.render(<FolderBrowser parentId="root" contentCount={0} />);
    });
    const button = await vi.waitFor(() => {
      const candidate = host.querySelector<HTMLButtonElement>(
        'button[aria-label^="Open Reference"]',
      );
      expect(candidate).not.toBeNull();
      return candidate;
    });
    if (!button) throw new Error("Missing folder card");
    await act(async () => button.click());
    expect(currentLocation(router).pathname).toBe("/folders/child");
  });

  it("opens subfolder operations from a real context-menu event", async () => {
    await act(async () => {
      root.render(<FolderBrowser parentId="root" contentCount={0} />);
    });
    const button = await vi.waitFor(() => {
      const candidate = host.querySelector<HTMLButtonElement>(
        'button[aria-label^="Open Reference"]',
      );
      expect(candidate).not.toBeNull();
      return candidate;
    });
    if (!button) throw new Error("Missing folder card");
    await act(async () => {
      button.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 24,
          clientY: 24,
        }),
      );
    });
    for (const label of [
      "Open Folder",
      "Quick Access",
      "Icon",
      "Color",
      "Sort By",
      "Show Subfolder Contents",
      "Customize Folder",
    ]) {
      expect(
        [...document.querySelectorAll('[role^="menuitem"]')].some(
          (item) => item.textContent?.trim() === label,
        ),
      ).toBe(true);
    }
  });
});
