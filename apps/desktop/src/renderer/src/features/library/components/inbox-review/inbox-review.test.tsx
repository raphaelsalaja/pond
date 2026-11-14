import "@/app/effects/save-library-bridge";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { folders } from "@/features/library/state/folders";
import { inboxReview } from "@/features/library/state/inbox-review";
import { libraryChrome } from "@/features/library/state/library-chrome";
import { normalise, SavePatchSchema } from "@/features/saves/lib/reconcile";
import { resultNavigation } from "@/features/saves/navigation";
import { pool } from "@/features/saves/state/pool";
import { ToastHost } from "@/shared/components/toast-host";
import { InboxReview } from ".";

let host: HTMLDivElement;
let root: Root;
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

function press(key: string) {
  host
    .querySelector('[aria-label="Review Inbox"]')
    ?.dispatchEvent(
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
      return { changed: 1 };
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
  addInboxSave("a", "First");
  addInboxSave("b", "Second");
  await folders.refresh();
  libraryChrome.setNav({ kind: "inbox" });
  resultNavigation.setSource({ key: "inbox", ids: ["a", "b"] });
  await inboxReview.start();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  inboxReview.exit();
  resultNavigation.setSource({ ids: [] });
  libraryChrome.setNav({ kind: "all" });
  pool.clear();
  vi.unstubAllGlobals();
});

it("keeps and skips from the keyboard, then shows the end of the queue", async () => {
  await act(async () => root.render(<InboxReview />));
  expect(host.textContent).toContain("1 of 2");
  expect(host.textContent).toContain("First");

  await act(async () => press("p"));
  expect(bulkEdits()).toEqual([
    {
      name: "saves.bulkEdit",
      input: { ids: ["a"], operation: { kind: "inbox", state: "processed" } },
    },
  ]);
  expect(host.textContent).toContain("2 of 2");
  expect(host.textContent).toContain("Second");

  await act(async () => press("ArrowRight"));
  expect(bulkEdits()).toHaveLength(1);
  expect(host.textContent).toContain("Review complete");
  expect(host.textContent).toContain("You kept 1 and skipped 1.");
});

it("files into a folder without marking the Save processed", async () => {
  await act(async () => root.render(<InboxReview />));
  await act(async () => press("1"));
  expect(requests).toContainEqual({
    name: "folders.addSaves",
    input: { folderId: "folder", saveIds: ["a"] },
  });
  expect(bulkEdits()).toHaveLength(0);
  expect(host.textContent).toContain("2 of 2");

  await act(async () => press("ArrowLeft"));
  expect(host.textContent).toContain("1 of 2");
});

it("rewinds to the Save whose change the toast undid", async () => {
  await act(async () =>
    root.render(
      <>
        <InboxReview />
        <ToastHost />
      </>,
    ),
  );
  await act(async () => press("p"));
  expect(host.textContent).toContain("2 of 2");

  const undo = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Undo",
  );
  if (!undo) throw new Error("Missing Undo toast");
  await act(async () => undo.click());
  expect(host.textContent).toContain("1 of 2");
  expect(host.textContent).toContain("First");
});

it("exits on Escape and leaves the grid in place", async () => {
  await act(async () => root.render(<InboxReview />));
  await act(async () => press("Escape"));
  expect(host.querySelector('[aria-label="Review Inbox"]')).toBeNull();
});
