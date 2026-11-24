import type { SavesImportFilesResult } from "@shared/saves-import-contracts";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import "@/app/effects/save-library-bridge";
import { currentLocation, openLibraryAt } from "@/app/test/library-router";
import type { LibraryTestRouter } from "@/app/test/library-router";
import {
  closeDuplicateImportReview,
  useDuplicateImportReview,
} from "@/features/saves/state/duplicate-import-review";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import { primarySelection, selection } from "@/features/saves/state/selection";
import { ToastHost } from "@/shared/components/toast-host";
import { routeMeta } from "@/shared/lib/route-meta";
import { toastManager } from "@/shared/lib/toast";
import { bridge } from "@/shared/test/pond-bridge";
import { runPasteImport } from "./paste-import";

let root: Root;
let host: HTMLDivElement;
let router: LibraryTestRouter;

beforeEach(async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  router = await openLibraryAt("/");
  await act(async () => root.render(<ToastHost />));
});

function shownNav() {
  return routeMeta(router, currentLocation(router).pathname).nav;
}

afterEach(async () => {
  resultNavigation.setSource({ ids: [] });
  selection.clear();
  primarySelection.set(null);
  toastManager.close();
  await act(async () => root.unmount());
  host.remove();
});

function toastText(): string {
  return document.body.querySelector("[data-slot='toasts']")?.textContent ?? "";
}

function showAction(): HTMLButtonElement | undefined {
  return [
    ...document.body.querySelectorAll<HTMLButtonElement>(
      "[data-slot='toasts'] button",
    ),
  ].find((button) => button.textContent === "Show in Library");
}

function replyToImport(reply: SavesImportFilesResult) {
  bridge.use({
    query: {
      "saves.reviewImportDuplicates": () => ({ candidates: [] }),
      "saves.importFiles": () => reply,
    },
  });
}

/** Cancels the duplicate review as soon as it opens, as its Cancel button does. */
function CancelDuplicateReview() {
  const request = useDuplicateImportReview();
  useEffect(() => {
    if (request) {
      closeDuplicateImportReview();
    }
  }, [request]);
  return null;
}

it("selects exactly the imported Saves in their folder, keeping the failure count", async () => {
  replyToImport({
    ok: true,
    ids: ["a", "b"],
    failedPaths: ["/tmp/broken.png"],
  });
  await act(async () => {
    await runPasteImport(
      {
        kind: "files",
        paths: ["/tmp/a.png", "/tmp/b.png", "/tmp/broken.png"],
      },
      { id: "folder-1", name: "Moodboard" },
    );
  });
  expect(toastText()).toContain('Saved 2 items to "Moodboard"');
  expect(toastText()).toContain("1 file couldn't be imported.");
  expect(shownNav()).toEqual({ kind: "all" });
  expect(selection.snapshot()).toEqual([]);

  await act(async () => showAction()?.click());
  expect(shownNav()).toEqual({ kind: "folder", id: "folder-1" });
  expect(selection.snapshot()).toEqual(["a", "b"]);
  expect(primarySelection.get()).toBe("a");
});

it("selects the pasted links that were added in All, not the ones that failed", async () => {
  bridge.use({
    query: {
      "saves.quickAdd": ({ url }) =>
        url === "https://one.test/"
          ? { ok: true, id: "one" }
          : { ok: false, error: "unsupported_url" },
    },
  });
  router = await openLibraryAt("/folders/elsewhere");
  await act(async () => {
    await runPasteImport({
      kind: "urls",
      urls: ["https://one.test/", "https://two.test/"],
    });
  });
  expect(toastText()).toContain("Downloading");

  await act(async () => showAction()?.click());
  expect(shownNav()).toEqual({ kind: "all" });
  expect(selection.snapshot()).toEqual(["one"]);
});

it("reselects the Saves once the destination publishes its results", async () => {
  replyToImport({ ok: true, ids: ["a", "b"] });
  await act(async () => {
    await runPasteImport(
      { kind: "files", paths: ["/tmp/a.png", "/tmp/b.png"] },
      { id: "folder-1", name: "Moodboard" },
    );
  });
  await act(async () => showAction()?.click());
  selection.clear();
  resultNavigation.setSource({ key: "folder-1", ids: ["c", "a", "b"] });
  expect(selection.snapshot()).toEqual(["a", "b"]);
  expect(selection.getCursor()).toBe("a");
});

it("offers no Show in Library when nothing was imported", async () => {
  replyToImport({ ok: false, error: "no_files" });
  await act(async () => {
    await runPasteImport({ kind: "files", paths: ["/tmp/missing.png"] });
  });
  expect(toastText()).toContain("Couldn't save to Pond");
  expect(showAction()).toBeUndefined();
});

it("stays quiet when the import was cancelled", async () => {
  const staged = "/tmp/pond-clip/clipboard.png";
  bridge.use({
    query: {
      "saves.stageClipboard": () => ({ ok: true, paths: [staged] }),
      "saves.reviewImportDuplicates": () => ({
        candidates: [
          {
            path: staged,
            filename: "clipboard.png",
            existingId: "existing",
            existingTitle: null,
            inTrash: false,
          },
        ],
      }),
      "saves.discardStagedClipboard": () => ({ ok: true }),
    },
  });
  let pending: Promise<Array<string>> | undefined;
  await act(async () => {
    root.render(
      <>
        <ToastHost />
        <CancelDuplicateReview />
      </>,
    );
    pending = runPasteImport({ kind: "clipboard" });
  });
  /** Awaited outside act so the review request can render and be cancelled. */
  await expect(pending).resolves.toEqual([]);
  expect(window.pond.query).not.toHaveBeenCalledWith(
    "saves.importFiles",
    expect.anything(),
  );
  expect(toastText()).toBe("");
  expect(showAction()).toBeUndefined();
});
