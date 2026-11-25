import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { inboxReview } from "@/features/library/state/inbox-review";
import { normalise, SavePatchSchema } from "@/features/saves/lib/reconcile";
import { pool } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";
import { bridge } from "@/shared/test/pond-bridge";
import { useInboxItems } from "./use-inbox-items";
import type { InboxItem } from "./use-inbox-items";

let host: HTMLDivElement;
let root: Root;
/** Every list `useInboxItems` returned, newest last. */
const renders: Array<Array<InboxItem>> = [];
const fixtures = new Map<string, Save>();

function addInboxSave(id: string) {
  const save = normalise(
    SavePatchSchema.parse({
      id,
      title: id,
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
  fixtures.set(id, save);
  pool.upsert({ ...save, inboxState: "review" });
}

function Probe({ onRender }: { onRender: (items: Array<InboxItem>) => void }) {
  onRender(useInboxItems());
  return null;
}

function listed(): Array<InboxItem> {
  return renders.at(-1) ?? [];
}

function saveIds() {
  return listed().flatMap((item) => (item.type === "save" ? [item.id] : []));
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  renders.length = 0;
  bridge.use({
    query: {
      "saves.queryPage": () => ({
        ids: ["a", "b", "c"],
        total: 3,
        nextCursor: null,
        libraryId: "library",
        revision: 0,
      }),
      "notifications.list": () => [],
      "libraryHealth.overview": () => ({
        check: null,
        job: null,
        media: {
          state: "idle",
          prepared: 0,
          remaining: 0,
          currentTitle: null,
          pauseReason: null,
          lastError: null,
          pendingPosters: 0,
          activeSaveIds: [],
          discovering: false,
          failures: [],
        },
      }),
    },
  });
  addInboxSave("a");
  addInboxSave("b");
  addInboxSave("c");
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  inboxReview.exit();
  pool.clear();
  fixtures.clear();
});

async function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Probe onRender={(items) => renders.push(items)} />
      </QueryClientProvider>,
    );
    await inboxReview.start("review");
  });
}

it("lists the queued saves and drops each one the review resolves", async () => {
  await mount();
  expect(saveIds()).toEqual(["a", "b", "c"]);

  await act(async () => inboxReview.advance("keep"));
  expect(saveIds()).toEqual(["b", "c"]);
});

it("keeps a skipped save listed but marks it read", async () => {
  await mount();
  await act(async () => inboxReview.advance("skip"));
  expect(saveIds()).toEqual(["a", "b", "c"]);
  const first = listed().find(
    (item) => item.type === "save" && item.id === "a",
  );
  expect(first?.type === "save" && first.unread).toBe(false);
});

it("drops a save removed from the Inbox while it remains in the queue", async () => {
  await mount();
  const fixture = fixtures.get("b");
  if (!fixture) {
    throw new Error("Missing fixture");
  }
  await act(async () => {
    pool.upsert({ ...fixture, inboxState: null, inboxUntil: null });
  });
  expect(saveIds()).toEqual(["a", "c"]);
});

it("drops a save whose state leaves the scope and restores it when it returns", async () => {
  await mount();
  const fixture = fixtures.get("b");
  if (!fixture) {
    throw new Error("Missing fixture");
  }
  await act(async () => {
    pool.upsert({ ...fixture, inboxState: "processed" });
  });
  expect(saveIds()).toEqual(["a", "c"]);

  await act(async () => {
    pool.upsert({ ...fixture, inboxState: "review" });
  });
  expect(saveIds()).toEqual(["a", "b", "c"]);
});
