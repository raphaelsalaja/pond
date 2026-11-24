import "@/app/effects/save-library-bridge";
import { PrefsSchema } from "@pond/schema";
import { Tooltip } from "@pond/ui";
import type { WireSave } from "@shared/wire";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { downloadsColumnsLayout } from "@/features/downloads/state/downloads-columns";
import { downloadsFilters } from "@/features/downloads/state/downloads-filters";
import { downloadsSelection } from "@/features/downloads/state/downloads-selection";
import { primarySelection } from "@/features/saves/navigation";
import { savesStore } from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";
import { bridge } from "@/shared/test/pond-bridge";
import type { QueryHandlers } from "@/shared/test/pond-bridge";
import { DownloadsPage } from "./";
import { hydrateLiveDownloadSaves } from "./hydrate-live-saves";

function save(
  id: string,
  status: Save["status"],
  taskStatus?: "running" | "pending" | "dead",
  extras: Partial<Save> = {},
): Save {
  return {
    id,
    source: "youtube",
    sourceId: id,
    url: `https://example.com/${id}`,
    title: id,
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: null,
    files: [],
    tags: [],
    savedAt: 1,
    createdAt: 1,
    deletedAt: null,
    status,
    tasks: taskStatus
      ? [
          {
            op: "fetch_video_ytdlp",
            status: taskStatus,
            attempts: taskStatus === "pending" ? 0 : 1,
            maxAttempts: 5,
            lastError: taskStatus === "dead" ? "Network unavailable" : null,
            nextRunAt: 0,
            updatedAt: 1,
          },
        ]
      : [],
    ...extras,
  };
}
function setSaves(saves: Array<Save>) {
  savesStore.setState((state) => ({
    byId: new Map(saves.map((save) => [save.id, save])),
    sorted: saves,
    revision: state.revision + 1,
  }));
}
/** SAFETY: the pool and the Downloads table read only the fields `save()` fills. */
function asWire(saves: Array<Save>): Array<WireSave> {
  return saves as Array<WireSave>;
}
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let cancelled: Array<Array<string>>;
function defaultQueries(): QueryHandlers {
  return {
    "settings.getPrefs": () => PrefsSchema.parse({}),
    "downloads.activity": () => [],
    "downloads.history": () => ({ rows: [], nextCursor: null }),
    "pipeline.status": () => ({ paused: false, inflight: 0 }),
    "pipeline.inflight": () => [],
    "downloads.ingestingOrFailed": () => [],
    "saves.getMany": () => [],
    "queue.sourceGates": () => [],
    "transferJobs.list": () => [],
  };
}

beforeEach(() => {
  downloadsFilters.reset();
  downloadsColumnsLayout.reset();
  primarySelection.set(null);
  cancelled = [];
  bridge.use({
    query: defaultQueries(),
    pipelinePause: async (paused) => ({ ok: true, paused }),
    pipelineCancelSaves: async (ids) => {
      cancelled.push([...ids]);
      return { ok: true, cancelled: ids.length };
    },
  });
  setSaves([
    save("Running video", "ingesting", "running"),
    save("Waiting video", "ingesting", "pending"),
    save("Failed video", "failed", "dead"),
  ]);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    downloadsSelection.clear();
    downloadsFilters.reset();
    setSaves([]);
  });
  client.clear();
  host.remove();
});
async function render() {
  const router = createRouter({
    routeTree: createRootRoute({ component: DownloadsPage }),
    history: createMemoryHistory({ initialEntries: ["/downloads"] }),
  });
  await act(async () => {
    await router.load();
    root.render(
      <QueryClientProvider client={client}>
        <Tooltip.Provider>
          <RouterProvider router={router} />
        </Tooltip.Provider>
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}
async function click(selector: string, modifiers = {}) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Missing ${selector}`);
  }
  await act(async () => {
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, ...modifiers }),
    );
  });
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

function rowNames(): Array<string> {
  return [...host.querySelectorAll('[role="row"]')].flatMap((row) => {
    const name = [...row.querySelectorAll("[title]")]
      .find((node) => node.textContent?.trim())
      ?.getAttribute("title");
    return row.closest('[role="rowgroup"]') && name ? [name] : [];
  });
}

async function clickButton(label: string) {
  const button = [...document.querySelectorAll("button")].find(
    (node) =>
      node.getAttribute("aria-label") === label || node.textContent === label,
  );
  if (!button) {
    throw new Error(`Missing button ${label}`);
  }
  await act(async () => button.click());
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

async function clickFilterOption(label: string) {
  const option = [
    ...document.querySelectorAll('[role="menuitemcheckbox"]'),
  ].find((node) => node.textContent === label);
  if (!option) {
    throw new Error(`Missing filter option ${label}`);
  }
  await act(async () =>
    option.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}
it("shows live downloads that paging missed without hydrating the whole library", async () => {
  const queued = save("Old failure", "failed", "dead");
  setSaves([save("Recent clip", "complete")]);
  const requested: Array<Array<string>> = [];
  bridge.use({
    query: {
      "downloads.ingestingOrFailed": () => [queued.id],
      "saves.getMany": ({ ids }) => {
        requested.push(ids);
        return asWire([queued]);
      },
    },
  });
  await render();
  expect(window.pond.query).toHaveBeenCalledWith(
    "downloads.ingestingOrFailed",
    {},
  );
  expect(window.pond.query).not.toHaveBeenCalledWith(
    "saves.list",
    expect.anything(),
  );
  expect(requested).toContainEqual([queued.id]);
  expect(requested).toEqual(requested.map(() => [queued.id]));
  expect(host.textContent).toContain("Old failure");
  expect(host.querySelector('[title="Recent clip"]')).toBeNull();
});

it("does not refetch queue saves that are already in the library pool", async () => {
  bridge.use({
    query: {
      "downloads.ingestingOrFailed": () => [
        "Running video",
        "Waiting video",
        "Failed video",
      ],
    },
  });

  await render();

  expect(window.pond.query).not.toHaveBeenCalledWith(
    "saves.getMany",
    expect.anything(),
  );
});

it("hydrates large queues in renderer-sized batches", async () => {
  setSaves([]);
  const ids = Array.from({ length: 401 }, (_, index) => `save-${index}`);
  const batches: Array<Array<string>> = [];
  bridge.use({
    query: {
      "saves.getMany": (input) => {
        batches.push(input.ids);
        return [];
      },
    },
  });

  await hydrateLiveDownloadSaves(ids, () => false);

  expect(batches.map((batch) => batch.length)).toEqual([200, 200, 1]);
});

it("keeps running work active when the queue is paused without showing action bars", async () => {
  await render();
  expect(host.querySelector('[role="tablist"]')).toBeNull();
  expect(host.querySelector('[aria-label="Filter"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Queue details"]')).toBeNull();
  expect(host.querySelector("footer")).toBeNull();
  await click('[aria-label="Pause Queue"]');
  expect(window.pond.pipelinePause).toHaveBeenCalledWith(true);
  expect(
    host.querySelector('[data-status="running"]')?.hasAttribute("data-moving"),
  ).toBe(true);
  expect(host.querySelector('[data-status="waiting"]')?.textContent).toContain(
    "Paused",
  );
  await click('[title="Failed video"]', { metaKey: true });
  expect(
    host.querySelector('[aria-label="Actions for Running video"]'),
  ).toBeNull();
  expect(document.querySelector('[role="menuitem"]')).toBeNull();
  expect(primarySelection.get()).toBeNull();
});

it("selects rows with checkboxes and prunes completed selections after live updates", async () => {
  await render();
  const runningRow = host
    .querySelector('[title="Running video"]')
    ?.closest('[role="row"]');
  const checkbox = runningRow?.querySelector<HTMLElement>('[role="checkbox"]');
  expect(checkbox?.getAttribute("aria-checked")).toBe("false");
  await act(async () => checkbox?.click());
  expect(checkbox?.getAttribute("aria-checked")).toBe("true");
  expect(downloadsSelection.size()).toBe(1);
  expect(primarySelection.get()).toBeNull();
  await act(async () =>
    setSaves([
      save("Running video", "complete"),
      save("Failed video", "failed", "dead"),
    ]),
  );
  expect(downloadsSelection.size()).toBe(0);
  await click('[title="Failed video"]');
  expect(primarySelection.get()).toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("selects a download row on click", async () => {
  await render();
  await click('[title="Running video"]');

  const selectedRow = host
    .querySelector('[title="Running video"]')
    ?.closest('[role="row"]');
  expect(selectedRow?.hasAttribute("data-selected")).toBe(true);
  expect(selectedRow?.hasAttribute("data-inspected")).toBe(false);
});

it("selects every download with Command-A while the table is focused", async () => {
  await render();
  const table = host.querySelector<HTMLElement>('[role="grid"]');
  if (!table) {
    throw new Error("Missing Downloads table");
  }
  table.focus();

  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "a",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });

  expect(downloadsSelection.size()).toBe(3);
  expect(
    [...host.querySelectorAll('[role="checkbox"]')].every(
      (checkbox) => checkbox.getAttribute("aria-checked") === "true",
    ),
  ).toBe(true);
});

function selectionBar(): HTMLElement | null {
  return host.querySelector(
    '[role="toolbar"][aria-label="Selected Downloads"]',
  );
}

function barButton(label: string): HTMLButtonElement {
  const button = selectionBar()?.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!button) {
    throw new Error(`Missing selection action ${label}`);
  }
  return button;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

it("selects a range of downloads with Shift-click", async () => {
  await render();
  const [first, , last] = rowNames();
  await click(`[title="${first}"]`);
  await click(`[title="${last}"]`, { shiftKey: true });

  expect(downloadsSelection.size()).toBe(3);
  expect(
    host.querySelectorAll('[role="rowgroup"] [role="row"][data-selected]'),
  ).toHaveLength(3);
});

it("selects and clears every download from the header checkbox", async () => {
  await render();
  const header = host.querySelector<HTMLElement>(
    '[role="columnheader"] [role="checkbox"]',
  );
  if (!header) {
    throw new Error("Missing header checkbox");
  }
  expect(header.getAttribute("aria-checked")).toBe("false");

  await click('[title="Running video"]');
  expect(header.getAttribute("aria-checked")).toBe("mixed");

  await act(async () => header.click());
  expect(downloadsSelection.size()).toBe(3);
  expect(header.getAttribute("aria-checked")).toBe("true");
  expect(selectionBar()?.textContent).toContain("3 selected");

  await act(async () => header.click());
  expect(downloadsSelection.size()).toBe(0);
});

it("shows bulk actions for the selection and cancels it in one request", async () => {
  await render();
  expect(selectionBar()).toBeNull();

  await click('[title="Running video"]');
  await click('[title="Waiting video"]', { metaKey: true });
  expect(selectionBar()?.textContent).toContain("2 selected");
  expect(barButton("Retry").hasAttribute("data-disabled")).toBe(true);
  expect(barButton("Cancel").hasAttribute("data-disabled")).toBe(false);

  await act(async () => barButton("Cancel").click());
  await settle();

  expect(cancelled).toHaveLength(1);
  expect([...(cancelled[0] ?? [])].sort()).toEqual([
    "Running video",
    "Waiting video",
  ]);
  expect(downloadsSelection.size()).toBe(0);
});

it("retries only failed rows and skips the rest from the selection toolbar", async () => {
  const skipped: Array<Array<string>> = [];
  bridge.use({
    query: {
      "saves.retryFailed": () => ({ ok: true, requeued: 1 }),
      "saves.skipIngest": ({ ids }) => {
        skipped.push(ids);
        return { ok: true, skipped: 3 };
      },
    },
  });
  await render();

  await click('[title="Failed video"]');
  await click('[title="Running video"]', { metaKey: true });
  await act(async () => barButton("Retry").click());
  await settle();
  expect(window.pond.query).toHaveBeenCalledWith("saves.retryFailed", {
    ids: ["Failed video"],
  });
  expect(downloadsSelection.size()).toBe(0);

  const table = host.querySelector<HTMLElement>('[role="grid"]');
  table?.focus();
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", metaKey: true, bubbles: true }),
    );
  });
  await act(async () => barButton("Skip").click());
  await settle();
  expect([...(skipped[0] ?? [])].sort()).toEqual([
    "Failed video",
    "Running video",
    "Waiting video",
  ]);
  expect(downloadsSelection.size()).toBe(0);
});

it("applies a context menu action to every selected download", async () => {
  await render();
  await click('[title="Running video"]');
  await click('[title="Waiting video"]', { metaKey: true });
  const row = host
    .querySelector('[title="Waiting video"]')
    ?.closest('[role="row"]');
  if (!row) {
    throw new Error("Missing Waiting video row");
  }

  await act(async () => {
    row.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 10,
      }),
    );
  });
  await settle();
  expect(downloadsSelection.size()).toBe(2);
  const item = [...document.querySelectorAll('[role="menuitem"]')].find(
    (node) => node.textContent === "Cancel Selected",
  );
  if (!item) {
    throw new Error("Missing Cancel Selected menu item");
  }
  await act(async () =>
    item.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
  await settle();

  expect(cancelled).toHaveLength(1);
  expect([...(cancelled[0] ?? [])].sort()).toEqual([
    "Running video",
    "Waiting video",
  ]);
});

it("lists waiting and completed rows in the same table", async () => {
  setSaves([
    save("Z clip", "ingesting", "running"),
    save("A clip", "ingesting", "running"),
    save("Waiting video", "ingesting", "pending"),
  ]);
  await render();
  expect(host.querySelector('[role="tablist"]')).toBeNull();
  expect(host.querySelector('[title="Waiting video"]')).not.toBeNull();
  const waitingProgress = host.querySelector(
    '[aria-label="Waiting video transfer progress"]',
  );
  expect(waitingProgress?.getAttribute("aria-valuenow")).toBe("0");
  expect(waitingProgress?.textContent).toBe("0%");
  expect(waitingProgress?.querySelector("progress")).toBeNull();
  await click('[aria-label="Sort by Name"]');
  expect(rowNames()).toEqual(["A clip", "Waiting video", "Z clip"]);
  await click('[aria-label="Sort by Name"]');
  expect(rowNames()).toEqual(["Z clip", "Waiting video", "A clip"]);
  expect(downloadsSelection.size()).toBe(0);
  expect(primarySelection.get()).toBeNull();
});

it("shows completed history in the table without opening a group", async () => {
  bridge.use({
    query: {
      "downloads.history": () => ({
        rows: [
          {
            id: 2,
            saveId: "local-file",
            title: "Local file",
            url: "pond:local/local-file",
            source: "local",
            outcome: "complete",
            durationMs: 0,
            attempts: 0,
            failedOp: null,
            error: null,
            ts: 2000,
          },
          {
            id: 1,
            saveId: "done",
            title: "Saved clip",
            url: "https://example.com/done",
            source: "youtube",
            outcome: "complete",
            durationMs: 3000,
            attempts: 1,
            failedOp: null,
            error: null,
            ts: 1000,
          },
        ],
        nextCursor: null,
      }),
    },
  });
  downloadsFilters.setStatuses(new Set());
  await render();
  expect(host.querySelector('[title="Local file"]')).toBeNull();
  await click('[title="Saved clip"]');
  expect(primarySelection.get()).toBeNull();
  await click('[title="Saved clip"]', { detail: 2 });
  expect(primarySelection.get()).toBe("done");
});

it("hides completed downloads by default and shows them on request", async () => {
  setSaves([]);
  bridge.use({
    query: {
      "downloads.history": () => ({
        rows: [
          {
            id: 1,
            saveId: "done",
            title: "Saved clip",
            url: "https://example.com/done",
            source: "youtube",
            outcome: "complete",
            durationMs: 3000,
            attempts: 1,
            failedOp: null,
            error: null,
            ts: 1000,
          },
        ],
        nextCursor: { ts: 1000, id: 1 },
      }),
    },
  });
  await render();
  expect(host.querySelector('[title="Saved clip"]')).toBeNull();
  expect(host.textContent).toContain("No Unfinished Downloads");

  await clickButton("Show Completed");
  expect(host.querySelector('[title="Saved clip"]')).not.toBeNull();
});

it("keeps status out of the name", async () => {
  setSaves([
    save("Clip", "ingesting", "pending"),
    save("Failed video", "failed", "dead", {
      source: "web",
      url: "https://www.youtube.com/",
      title: "https://www.youtube.com/",
    }),
  ]);
  await render();
  expect(host.querySelector('[aria-label="Sort by Status"]')).not.toBeNull();
  expect(host.querySelector('[title="Clip"]')?.textContent).not.toContain(
    "In Progress",
  );
  expect(
    host.querySelector('[title="https://www.youtube.com/"]')?.textContent,
  ).not.toContain("Failed");
  expect(host.querySelector('[data-status="waiting"]')?.textContent).toContain(
    "Waiting",
  );
  expect(host.textContent).not.toContain("Stopped after");
  const youtubeRow = host
    .querySelector('[title="https://www.youtube.com/"]')
    ?.closest('[role="row"]');
  expect(youtubeRow?.textContent).toContain("Failed");
});

it("explains why a download failed from its status", async () => {
  setSaves([
    save("Running video", "ingesting", "running"),
    save("Instagram reel", "ingesting", undefined, {
      source: "instagram",
      tasks: [
        {
          op: "harvest_metadata",
          status: "blocked",
          attempts: 0,
          maxAttempts: 5,
          lastError:
            "AuthRequiredError: Connect Instagram with the Pond extension",
          nextRunAt: 0,
          updatedAt: 1,
        },
      ],
    }),
  ]);
  await render();

  const failedRow = host
    .querySelector('[title="Instagram reel"]')
    ?.closest('[role="row"]');
  const status = failedRow?.querySelector(
    '[data-status="failed"]',
  )?.parentElement;
  expect(failedRow?.textContent).toContain("Failed");
  expect(document.body.textContent).not.toContain(
    "Instagram needs you to sign in again.",
  );

  await act(async () => {
    for (const type of ["pointerenter", "mouseenter", "mousemove"]) {
      status?.dispatchEvent(new MouseEvent(type, { bubbles: true }));
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 800);
    });
  });
  expect(document.body.textContent).toContain(
    "Instagram needs you to sign in again. Reconnect it in Sources to resume.",
  );
});

it("explains a download waiting on its hourly limit", async () => {
  const now = Date.now();
  setSaves([
    save("Queued clip", "ingesting", undefined, {
      source: "twitter",
      tasks: [
        {
          op: "harvest_metadata",
          status: "deferred",
          deferredReason: "source_budget",
          attempts: 0,
          maxAttempts: 5,
          lastError: null,
          nextRunAt: now + 12 * 60_000,
          updatedAt: 1,
        },
      ],
    }),
  ]);
  bridge.use({
    query: {
      "queue.sourceGates": () => [
        {
          source: "twitter",
          state: "closed",
          reason: null,
          retryAt: null,
          remainingHourly: 0,
          remainingDaily: 20,
          maxPerHour: 40,
          maxPerDay: 600,
          recoveryProbe: false,
        },
      ],
    },
  });
  await render();
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });

  const queuedRow = host
    .querySelector('[title="Queued clip"]')
    ?.closest('[role="row"]');
  const status = queuedRow?.querySelector(
    '[data-status="progress"]',
  )?.parentElement;
  expect(queuedRow?.textContent).toContain("Waiting for Twitter");
  await act(async () => {
    for (const type of ["pointerenter", "mouseenter", "mousemove"]) {
      status?.dispatchEvent(new MouseEvent(type, { bubbles: true }));
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 800);
    });
  });
  expect(document.body.textContent).toContain(
    "Hourly download limit reached (40/hour). Resumes in 12 min.",
  );
});

it("refreshes a download once its last running task settles", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const running = save("Instagram reel", "ingesting", "running");
  const blocked = save("Instagram reel", "ingesting", undefined, {
    tasks: [
      {
        op: "harvest_metadata",
        status: "blocked",
        attempts: 0,
        maxAttempts: 5,
        lastError:
          "AuthRequiredError: Connect Instagram with the Pond extension",
        nextRunAt: 0,
        updatedAt: 2,
      },
    ],
  });
  let inflight = ["Instagram reel"];
  let current = running;
  setSaves([running]);
  bridge.use({
    query: {
      "pipeline.inflight": () => inflight,
      "saves.getMany": () => asWire([current]),
    },
  });

  try {
    await render();
    const row = () =>
      host.querySelector('[title="Instagram reel"]')?.closest('[role="row"]');
    expect(row()?.textContent).toContain("In Progress");

    inflight = [];
    current = blocked;
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });

    expect(window.pond.query).toHaveBeenCalledWith("saves.getMany", {
      ids: ["Instagram reel"],
    });
    expect(row()?.textContent).toContain("Failed");
  } finally {
    vi.useRealTimers();
  }
});

it("keeps media previews out of the name column", async () => {
  setSaves([
    save("Image file", "failed", undefined, { mediaType: "image" }),
    save("Video file", "ingesting", "running", { mediaType: "video" }),
  ]);
  await render();
  const image = host.querySelector('[title="Image file"]');
  const video = host.querySelector('[title="Video file"]');
  expect(image?.querySelector("svg")).toBeNull();
  expect(video?.querySelector("svg")).toBeNull();
  expect(image?.querySelector("img")).toBeNull();
  expect(video?.querySelector("img")).toBeNull();
});

it("filters active, waiting, and failed work from the filter toolbar", async () => {
  await render();
  await clickButton("Filter");
  await clickButton("Status: 5");
  await clickFilterOption("Active");
  await clickFilterOption("Failed");
  expect(host.querySelector('[title="Waiting video"]')).not.toBeNull();
  expect(host.querySelector('[title="Running video"]')).toBeNull();
  expect(host.querySelector('[title="Failed video"]')).toBeNull();

  await clickFilterOption("Waiting");
  await clickFilterOption("Active");
  expect(host.querySelector('[title="Running video"]')).not.toBeNull();
  expect(host.querySelector('[title="Waiting video"]')).toBeNull();

  await clickFilterOption("Active");
  await clickFilterOption("Failed");
  expect(host.querySelector('[title="Failed video"]')).not.toBeNull();
  expect(host.querySelector('[title="Running video"]')).toBeNull();
  expect(host.querySelector('[title="Waiting video"]')).toBeNull();
});

it("moves every unfinished download to Trash and leaves finished saves", async () => {
  setSaves([
    save("Running video", "ingesting", "running"),
    save("Waiting video", "ingesting", "pending"),
    save("Failed video", "failed", "dead"),
    save("Finished video", "complete"),
  ]);
  bridge.use({
    query: {
      "downloads.ingestingOrFailed": () => [
        "Running video",
        "Waiting video",
        "Failed video",
        "Older hidden failure",
      ],
      "downloads.clearUnfinished": () => ({
        changed: 4,
        ids: [
          "Running video",
          "Waiting video",
          "Failed video",
          "Older hidden failure",
        ],
      }),
      "feedback.emit": () => ({ ok: true }),
    },
  });

  await render();
  await clickButton("Filter");
  await clickButton("Status: 5");
  await clickFilterOption("Failed");
  await clickButton("Clear Unfinished");

  expect(window.pond.query).toHaveBeenCalledWith(
    "downloads.clearUnfinished",
    {},
  );
  expect(window.pond.query).not.toHaveBeenCalledWith(
    "saves.bulkEdit",
    expect.anything(),
  );
  expect(savesStore.state.byId.get("Finished video")?.deletedAt).toBeNull();
});

it("prevents duplicate clear requests while moving downloads to Trash", async () => {
  let finishTrash: (() => void) | undefined;
  const trashFinished = new Promise<void>((resolve) => {
    finishTrash = resolve;
  });
  let clearRequests = 0;
  bridge.use({
    query: {
      "downloads.ingestingOrFailed": () => ["Running video"],
      "downloads.clearUnfinished": async () => {
        clearRequests += 1;
        await trashFinished;
        return { changed: 1, ids: ["Running video"] };
      },
      "feedback.emit": () => ({ ok: true }),
    },
  });

  await render();
  const button = [...document.querySelectorAll("button")].find(
    (node) => node.getAttribute("aria-label") === "Clear Unfinished",
  );
  if (!button) {
    throw new Error("Missing Clear Unfinished button");
  }
  expect(button.querySelector("svg")).not.toBeNull();
  await act(async () => button.click());
  await act(
    async () =>
      new Promise((resolve) => {
        setTimeout(resolve, 0);
      }),
  );
  expect(button.hasAttribute("disabled")).toBe(true);
  await act(async () => button.click());

  expect(clearRequests).toBe(1);
  await act(async () => {
    finishTrash?.();
    await trashFinished;
  });
});

it("ignores hydration rows captured before unfinished downloads were cleared", async () => {
  let finishHydration: ((rows: Array<WireSave>) => void) | undefined;
  const hydration = new Promise<Array<WireSave>>((resolve) => {
    finishHydration = resolve;
  });
  setSaves([save("Running video", "ingesting", "running")]);
  bridge.use({
    query: {
      "downloads.ingestingOrFailed": () => ["Older failure"],
      "saves.getMany": () => hydration,
      "downloads.clearUnfinished": () => ({
        changed: 2,
        ids: ["Running video", "Older failure"],
      }),
      "feedback.emit": () => ({ ok: true }),
    },
  });

  await render();
  await clickButton("Clear Unfinished");
  await act(async () => {
    finishHydration?.(asWire([save("Older failure", "failed", "dead")]));
    await hydration;
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });

  expect(host.querySelector('[title="Running video"]')).toBeNull();
  expect(host.querySelector('[title="Older failure"]')).toBeNull();
});

it("ignores in-flight reloads captured before running downloads were cleared", async () => {
  let finishReload: ((rows: Array<WireSave>) => void) | undefined;
  const reload = new Promise<Array<WireSave>>((resolve) => {
    finishReload = resolve;
  });
  setSaves([save("Running video", "ingesting", "running")]);
  bridge.use({
    query: {
      "pipeline.inflight": () => ["Running video"],
      "saves.getMany": () => reload,
      "downloads.clearUnfinished": () => ({
        changed: 1,
        ids: ["Running video"],
      }),
      "feedback.emit": () => ({ ok: true }),
    },
  });

  await render();
  await clickButton("Clear Unfinished");
  await act(async () => {
    finishReload?.(asWire([save("Running video", "ingesting", "running")]));
    await reload;
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });

  expect(host.querySelector('[title="Running video"]')).toBeNull();
});

it("bounds the initial render before the downloads table is measured", async () => {
  setSaves(
    Array.from({ length: 1000 }, (_, index) =>
      save(`Failed video ${index}`, "failed", "dead"),
    ),
  );

  await render();

  expect(host.querySelectorAll('[role="row"]').length).toBeLessThan(100);
});

it("shows Library Transfers as rows in the Downloads table", async () => {
  bridge.use({
    query: {
      "transferJobs.list": () => [
        {
          id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          request: {
            kind: "export_files",
            origin: "/Users/user/Pond",
            destination: "/Users/user/Downloads/Geoid (Pond Export 2026-11-22)",
          },
          status: "running",
          phase: "Copying files",
          completed: 3,
          total: 12,
          bytes: 0,
          currentFile: null,
          error: null,
          startedAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    },
  });
  await render();
  expect(rowNames()[0]).toBe(
    "/Users/user/Downloads/Geoid (Pond Export 2026-11-22)",
  );
  expect(
    host.querySelector('[role="row"] [title="Export Files"]'),
  ).not.toBeNull();
  expect(host.textContent).toContain("Copying files 3 of 12");
  expect(host.textContent).not.toContain("Library Transfers");
});
