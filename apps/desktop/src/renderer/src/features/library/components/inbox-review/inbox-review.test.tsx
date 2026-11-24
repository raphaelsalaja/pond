import "@/app/effects/save-library-bridge";
import { RouterProvider } from "@tanstack/react-router";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { folders } from "@/features/library/state/folders";
import { inboxReview } from "@/features/library/state/inbox-review";
import { normalise, SavePatchSchema } from "@/features/saves/lib/reconcile";
import { pool } from "@/features/saves/state/pool";
import { ToastHost } from "@/shared/components/toast-host";
import {
  createLibraryTestRouter,
  currentLocation,
  type LibraryTestRouter,
} from "@/shared/test/library-router";
import { InboxReview } from ".";

let host: HTMLDivElement;
let root: Root;
let router: LibraryTestRouter;
interface QueryInput {
  ids?: string[];
  folderId?: string;
  saveIds?: string[];
}

const requests: Array<{ name: string; input?: QueryInput }> = [];

function addInboxSave(id: string, title: string) {
  const save = normalise(
    SavePatchSchema.parse({
      id,
      title,
      source: "local",
      url: `https://example.test/${id}`,
      files: [
        {
          kind: "original",
          path: `${id}.png`,
          sha256: `${id}-sha256`,
          size: 2048,
          mimeType: "image/png",
          width: 1600,
          height: 1000,
        },
      ],
    }),
  );
  if (!save) throw new Error("Invalid Save fixture");
  pool.upsert({ ...save, inboxState: "review" });
}

function keyCode(key: string): string {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  return /^\d$/.test(key) ? `Digit${key}` : key;
}

function stage() {
  return document.querySelector('[aria-label="Review Inbox"]');
}

function topCard() {
  return stage()?.querySelector("[data-top]");
}

function progress() {
  return document.querySelector('[aria-live="polite"]')?.textContent;
}

async function mount(node: ReactNode = <InboxReview />) {
  router = createLibraryTestRouter("/inbox", { component: () => node });
  await act(async () => {
    await router.load();
    root.render(<RouterProvider router={router} />);
  });
  await act(async () => {});
}

function press(key: string) {
  stage()?.dispatchEvent(
    new KeyboardEvent("keydown", { key, code: keyCode(key), bubbles: true }),
  );
}

function bulkEdits() {
  return requests.filter((request) => request.name === "saves.bulkEdit");
}

beforeEach(async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  requests.length = 0;
  vi.stubGlobal("pond", {
    onSyncAction: () => () => {},
    undo: async () => ({ ok: true }),
    undoStep: async () => ({ outcome: "done", canUndo: false, canRedo: true }),
    redoStep: async () => ({ outcome: "done", canUndo: true, canRedo: false }),
    query: async (name: string, input?: QueryInput) => {
      requests.push({ name, input });
      if (name === "folders.list")
        return [
          {
            id: "folder",
            parentId: null,
            name: "Inspiration",
            color: null,
            sortOrder: 0,
            createdAt: new Date(0),
          },
        ];
      if (name === "folders.memberships" || name === "tags.list") return [];
      if (name === "saves.getMany") return [];
      if (name === "saves.queryPage") return { ids: ["a", "b"] };
      if (name === "saves.sidebarCounts")
        return {
          library: 2,
          uncategorized: 2,
          untagged: 2,
          recentlyAdded: 2,
          recentlyUsed: 0,
          inbox: 1,
          inboxSnoozed: 0,
          trash: 0,
          folders: {},
          foldersDownloading: {},
        };
      return { changed: 1, undoId: "step-1" };
    },
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  addInboxSave("a", "First");
  addInboxSave("b", "Second");
  await folders.refresh();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  inboxReview.exit();
  pool.clear();
  vi.unstubAllGlobals();
});

it("loads the Inbox into a full page with the next Save under the top card", async () => {
  await mount();
  expect(requests).toContainEqual({
    name: "saves.queryPage",
    input: expect.objectContaining({ scope: { inbox: "review" } }),
  });
  expect(progress()).toBe("1 / 2");
  expect(topCard()?.textContent).toContain("First");
  expect(stage()?.textContent).toContain("Second");

  await act(async () => press("ArrowDown"));
  expect(progress()).toBe("2 / 2");
  expect(topCard()?.textContent).toContain("Second");
});

it("keeps with the right arrow and skips with the down arrow", async () => {
  await mount();
  await act(async () => press("ArrowRight"));
  expect(bulkEdits()).toEqual([
    {
      name: "saves.bulkEdit",
      input: { ids: ["a"], operation: { kind: "inbox", state: "processed" } },
    },
  ]);
  expect(progress()).toBe("2 / 2");
  expect(topCard()?.textContent).toContain("Second");

  await act(async () => press("ArrowDown"));
  expect(bulkEdits()).toHaveLength(1);
  expect(stage()?.textContent).toContain("Review Complete");
  expect(stage()?.textContent).toContain("You kept 1 and skipped 1.");
});

it("trashes with the left arrow", async () => {
  await mount();
  await act(async () => press("ArrowLeft"));
  expect(bulkEdits()).toEqual([
    {
      name: "saves.bulkEdit",
      input: { ids: ["a"], operation: { kind: "trash" } },
    },
  ]);
  expect(progress()).toBe("2 / 2");
});

it("files into a folder without marking the Save processed", async () => {
  await mount();
  await act(async () => press("1"));
  expect(requests).toContainEqual({
    name: "folders.addSaves",
    input: { folderId: "folder", saveIds: ["a"] },
  });
  expect(bulkEdits()).toHaveLength(0);
  expect(progress()).toBe("2 / 2");

  await act(async () => press("z"));
  expect(progress()).toBe("1 / 2");
});

it("rewinds to the Save whose change the toast undid", async () => {
  await mount(
    <>
      <InboxReview />
      <ToastHost />
    </>,
  );
  await act(async () => press("p"));
  expect(progress()).toBe("2 / 2");

  const undo = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Undo",
  );
  if (!undo) throw new Error("Missing Undo toast");
  undo.focus();
  await act(async () => undo.click());
  expect(progress()).toBe("1 / 2");
  expect(topCard()?.textContent).toContain("First");
  expect(document.activeElement).toBe(stage());
});

it("closes on Escape and returns to the Library", async () => {
  await mount();
  await act(async () => press("Escape"));
  expect(currentLocation(router).pathname).toBe("/");
  expect(stage()).toBeNull();
});
