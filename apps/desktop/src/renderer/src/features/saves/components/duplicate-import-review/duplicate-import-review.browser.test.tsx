import "@/app/effects/save-library-bridge";
import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  closeDuplicateImportReview,
  importClipboardWithDuplicateReview,
  importFilesWithDuplicateReview,
} from "@/features/saves/state/duplicate-import-review";
import { bridge } from "@/shared/test/pond-bridge";
import { wireSave } from "@/shared/test/wire-save";
import { DuplicateImportReviewHost } from "./";

let root: Root;
let host: HTMLDivElement;
const first = "/Users/you/Downloads/a.png";
const second = "/Users/you/Downloads/b.png";
const paths = [first, second];
const existingRows = [
  wireSave({
    id: "save-sunset",
    source: "local",
    sourceId: "sunset",
    url: "file:///sunset.png",
    title: "Sunset",
    status: "complete",
    files: [
      {
        kind: "original",
        path: "sunset.png",
        sha256: "abc",
        size: 2048,
        mimeType: "image/png",
        width: 1600,
        height: 1000,
      },
    ],
  }),
];

beforeEach(() => {
  bridge.use({
    query: {
      "settings.getPrefs": () => PrefsSchema.parse({}),
      "saves.reviewImportDuplicates": () => ({
        candidates: paths.map((path) => ({
          path,
          filename: path.split("/").pop() ?? path,
          existingId: "save-sunset",
          existingTitle: "Sunset",
          inTrash: path === second,
        })),
      }),
      "saves.getMany": () => existingRows,
      "saves.stageClipboard": () => ({ ok: true, paths }),
      "saves.importFiles": () => ({ ok: true, ids: [] }),
      "saves.discardStagedClipboard": () => ({ ok: true }),
    },
    /** The existing Save's image card paces its motion by the host's thermal state. */
    machinePace: async () => ({ thermal: "nominal", onBattery: false }),
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    closeDuplicateImportReview();
    root.unmount();
  });
  host.remove();
});

function dialog() {
  const element = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!element) {
    throw new Error("Missing dialog");
  }
  return element;
}

function buttons(name: string) {
  return [...dialog().querySelectorAll("button")].filter(
    (element) => element.textContent?.trim() === name,
  );
}

function button(name: string) {
  const match = buttons(name).at(-1);
  if (!match) {
    throw new Error(`Missing button ${name}`);
  }
  return match;
}

type ReviewedImport = ReturnType<typeof importFilesWithDuplicateReview>;

async function startImport(
  start: () => ReviewedImport = () => importFilesWithDuplicateReview({ paths }),
) {
  let pending: ReviewedImport | undefined;
  await act(async () => {
    root.render(<DuplicateImportReviewHost />);
    pending = start();
  });
  await vi.waitFor(() => {
    expect(dialog().textContent).toContain("1600 × 1000");
  });
  return { pending };
}

function argsFor(operation: string) {
  return vi
    .mocked(window.pond.query)
    .mock.calls.find(([name]) => name === operation)?.[1];
}

function importArgs() {
  return argsFor("saves.importFiles");
}

it("compares the existing save with the new file", async () => {
  await startImport();
  const text = dialog().textContent;
  expect(text).toContain("Duplicate File");
  expect(text).toContain("1 of 2");
  expect(text).toContain("Existing");
  expect(text).toContain("a.png");
  expect(text).toContain("Downloads");
});

it("offers to restore a match that is in Trash", async () => {
  await startImport();
  expect(dialog().textContent).toContain("already in your Library");
  await act(async () => button("Next").click());
  await vi.waitFor(() => expect(dialog().textContent).toContain("2 of 2"));
  const text = dialog().textContent;
  expect(text).toContain("This file is in Trash.");
  expect(text).toContain("In Trash");
  expect(buttons("Restore")).toHaveLength(2);
});

it("names the confirm button after the chosen action", async () => {
  const { pending } = await startImport();
  expect(buttons("Import")).toHaveLength(0);
  await act(async () => button("Next").click());
  await vi.waitFor(() => expect(dialog().textContent).toContain("2 of 2"));
  await act(async () => button("Keep Both").click());
  expect(buttons("Restore")).toHaveLength(1);
  expect(buttons("Import")).toHaveLength(1);
  await act(async () => buttons("Restore")[0]?.click());
  await act(async () => button("Restore").click());
  await pending;
  expect(importArgs()).toMatchObject({
    duplicateDecisions: { [first]: "use-existing", [second]: "restore" },
  });
});

it("records each choice and applies one to the rest", async () => {
  const { pending } = await startImport();
  await act(async () => button("Next").click());
  await vi.waitFor(() => expect(dialog().textContent).toContain("2 of 2"));
  await act(async () => button("Keep Both").click());
  await act(async () => button("Import").click());
  await pending;
  expect(importArgs()).toMatchObject({
    duplicateDecisions: { [first]: "use-existing", [second]: "keep-both" },
  });
});

it("applies the choice to every remaining file", async () => {
  const { pending } = await startImport();
  await act(async () => button("Keep Both").click());
  await act(async () =>
    dialog().querySelector<HTMLElement>('[role="checkbox"]')?.click(),
  );
  await act(async () => button("Import").click());
  await pending;
  expect(importArgs()).toMatchObject({
    duplicateDecisions: { [first]: "keep-both", [second]: "keep-both" },
  });
});

it("sends an explicit restore only for the match in Trash", async () => {
  const { pending } = await startImport();
  await act(async () =>
    dialog().querySelector<HTMLElement>('[role="checkbox"]')?.click(),
  );
  await act(async () => button("Import").click());
  await pending;
  expect(importArgs()).toMatchObject({
    duplicateDecisions: { [first]: "use-existing", [second]: "restore" },
  });
});

it("discards the staged clipboard image when the review is cancelled", async () => {
  const { pending } = await startImport(() =>
    importClipboardWithDuplicateReview({}),
  );
  await act(async () => closeDuplicateImportReview());
  await pending;
  expect(importArgs()).toBeUndefined();
  expect(argsFor("saves.discardStagedClipboard")).toEqual({ paths });
});

it("discards only the staged clipboard images it didn't import", async () => {
  const { pending } = await startImport(() =>
    importClipboardWithDuplicateReview({}),
  );
  await act(async () => button("Next").click());
  await vi.waitFor(() => expect(dialog().textContent).toContain("2 of 2"));
  await act(async () => button("Keep Both").click());
  await act(async () => button("Import").click());
  await pending;
  expect(importArgs()).toMatchObject({ origin: "clipboard" });
  expect(argsFor("saves.discardStagedClipboard")).toEqual({ paths: [first] });
});
