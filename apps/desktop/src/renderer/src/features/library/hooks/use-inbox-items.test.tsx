import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { inboxReview } from "@/features/library/state/inbox-review";
import { normalise, SavePatchSchema } from "@/features/saves/lib/reconcile";
import { pool } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";
import { useInboxItems } from "./use-inbox-items";
import type { InboxItem } from "./use-inbox-items";

let host: HTMLDivElement;
let root: Root;
let listed: Array<InboxItem> = [];
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

function Probe() {
  listed = useInboxItems();
  return null;
}

function saveIds() {
  return listed.flatMap((item) => (item.type === "save" ? [item.id] : []));
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  listed = [];
  vi.stubGlobal("pond", {
    query: async (name: string) => {
      if (name === "saves.queryPage") {
        return { ids: ["a", "b", "c"] };
      }
      if (name === "notifications.list") {
        return [];
      }
      if (name === "libraryHealth.overview") {
        return null;
      }
      return { changed: 1 };
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
  vi.unstubAllGlobals();
});

async function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Probe />
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
  const first = listed.find((item) => item.type === "save" && item.id === "a");
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
