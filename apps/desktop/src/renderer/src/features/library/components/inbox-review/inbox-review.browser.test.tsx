import "@/app/effects/save-library-bridge";
import { PrefsSchema } from "@pond/schema";
import type { BulkEdit } from "@shared/bulk-contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  createLibraryTestRouter,
  currentLocation,
} from "@/app/test/library-router";
import type { LibraryTestRouter } from "@/app/test/library-router";
import { folders } from "@/features/library/state/folders";
import { inboxReview } from "@/features/library/state/inbox-review";
import { normalise, SavePatchSchema } from "@/features/saves/lib/reconcile";
import { closeSave, openSave } from "@/features/saves/navigation";
import { pool } from "@/features/saves/state/pool";
import { ToastHost } from "@/shared/components/toast-host";
import { bridge } from "@/shared/test/pond-bridge";
import { InboxReview } from ".";

let host: HTMLDivElement;
let root: Root;
let router: LibraryTestRouter;

const bulkEdits: Array<BulkEdit> = [];

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
  if (!save) {
    throw new Error("Invalid Save fixture");
  }
  pool.upsert({ ...save, inboxState: "review" });
}

function keyCode(key: string): string {
  if (/^[a-z]$/i.test(key)) {
    return `Key${key.toUpperCase()}`;
  }
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
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    await router.load();
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  });
  await act(async () => {});
}

function press(key: string) {
  stage()?.dispatchEvent(
    new KeyboardEvent("keydown", { key, code: keyCode(key), bubbles: true }),
  );
}

beforeEach(async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  bulkEdits.length = 0;
  bridge.use({
    undo: async () => ({
      ok: true,
      step: null,
      canUndo: false,
      canRedo: false,
    }),
    undoStep: async () => ({ outcome: "done", canUndo: false, canRedo: true }),
    redoStep: async () => ({ outcome: "done", canUndo: true, canRedo: false }),
    query: {
      "folders.list": () => [
        {
          id: "folder",
          parentId: null,
          name: "Inspiration",
          color: null,
          sortOrder: 0,
          createdAt: new Date(0),
        },
      ],
      "folders.memberships": () => [],
      "folders.addSaves": () => ({ ok: true, undoId: "step-1" }),
      "tags.list": () => [],
      "settings.getPrefs": () => PrefsSchema.parse({}),
      "notifications.list": () => [],
      "saves.getMany": () => [],
      "saves.bulkEdit": (input) => {
        bulkEdits.push(input);
        return { changed: 1, undoId: "step-1" };
      },
      "saves.queryPage": () => ({
        ids: ["a", "b"],
        total: 2,
        nextCursor: null,
        libraryId: "library",
        revision: 0,
      }),
      "saves.sidebarCounts": () => ({
        library: 2,
        uncategorized: 2,
        untagged: 2,
        recentlyAdded: 2,
        recentlyUsed: 0,
        splitPosts: 0,
        inbox: 1,
        inboxSnoozed: 0,
        trash: 0,
        folders: {},
        foldersDownloading: {},
      }),
    },
  });
  addInboxSave("a", "First");
  addInboxSave("b", "Second");
  await folders.refresh();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  inboxReview.exit();
  pool.clear();
});

it("loads the Inbox into a full page with the next Save under the top card", async () => {
  await mount();
  expect(window.pond.query).toHaveBeenCalledWith(
    "saves.queryPage",
    expect.objectContaining({ scope: { inbox: "review" } }),
  );
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
  expect(bulkEdits).toEqual([
    { ids: ["a"], operation: { kind: "inbox", state: "processed" } },
  ]);
  expect(progress()).toBe("2 / 2");
  expect(topCard()?.textContent).toContain("Second");

  await act(async () => press("ArrowDown"));
  expect(bulkEdits).toHaveLength(1);
  expect(stage()?.textContent).toContain("Review Complete");
  expect(stage()?.textContent).toContain("You kept 1 and skipped 1.");
});

it("trashes with the left arrow", async () => {
  await mount();
  await act(async () => press("ArrowLeft"));
  expect(bulkEdits).toEqual([{ ids: ["a"], operation: { kind: "trash" } }]);
  expect(progress()).toBe("2 / 2");
});

it("files into a folder without marking the Save processed", async () => {
  await mount();
  await act(async () => press("1"));
  expect(window.pond.query).toHaveBeenCalledWith("folders.addSaves", {
    folderId: "folder",
    saveIds: ["a"],
  });
  expect(bulkEdits).toHaveLength(0);
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
  if (!undo) {
    throw new Error("Missing Undo toast");
  }
  undo.focus();
  await act(async () => undo.click());
  expect(progress()).toBe("1 / 2");
  expect(topCard()?.textContent).toContain("First");
  expect(document.activeElement).toBe(stage());
});

it("keeps the review position when a Save preview opens and closes", async () => {
  await mount();
  await act(async () => press("ArrowDown"));
  expect(progress()).toBe("2 / 2");
  expect(topCard()?.textContent).toContain("Second");
  const queries = requests.filter(
    (request) => request.name === "saves.queryPage",
  ).length;

  await act(async () => openSave("b"));
  expect(stage()).toBeNull();

  await act(async () => closeSave());
  expect(progress()).toBe("2 / 2");
  expect(topCard()?.textContent).toContain("Second");
  expect(
    requests.filter((request) => request.name === "saves.queryPage"),
  ).toHaveLength(queries);
});

it("closes on Escape and returns to the Library", async () => {
  await mount();
  await act(async () => press("Escape"));
  expect(currentLocation(router).pathname).toBe("/");
  expect(stage()).toBeNull();
});
