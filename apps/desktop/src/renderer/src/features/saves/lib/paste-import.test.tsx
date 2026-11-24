import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@/app/effects/save-library-bridge";
import { getLibraryNav } from "@/features/library/state/library-chrome";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import { primarySelection, selection } from "@/features/saves/state/selection";
import { ToastHost } from "@/shared/components/toast-host";
import { toastManager } from "@/shared/lib/toast";
import { openLibraryAt } from "@/shared/test/library-router";
import { runPasteImport } from "./paste-import";

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await openLibraryAt("/");
  await act(async () => root.render(<ToastHost />));
});

afterEach(async () => {
  resultNavigation.setSource({ ids: [] });
  selection.clear();
  primarySelection.set(null);
  toastManager.close();
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
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

interface ImportReply {
  ok: boolean;
  ids?: string[];
  failedPaths?: string[];
  error?: string;
  reason?: string;
}

function stubImport(reply: ImportReply) {
  const query = vi.fn(async (operation: string) => {
    if (operation === "saves.reviewImportDuplicates") return { candidates: [] };
    if (operation === "saves.stageClipboard")
      return { ok: true, paths: ["/tmp/pond-clip/clipboard.png"] };
    return reply;
  });
  vi.stubGlobal("pond", { query });
  return query;
}

it("selects exactly the imported Saves in their folder, keeping the failure count", async () => {
  stubImport({ ok: true, ids: ["a", "b"], failedPaths: ["/tmp/broken.png"] });
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
  expect(getLibraryNav()).toEqual({ kind: "all" });
  expect(selection.snapshot()).toEqual([]);

  await act(async () => showAction()?.click());
  expect(getLibraryNav()).toEqual({ kind: "folder", id: "folder-1" });
  expect(selection.snapshot()).toEqual(["a", "b"]);
  expect(primarySelection.get()).toBe("a");
});

it("selects the pasted links that were added in All, not the ones that failed", async () => {
  const query = vi.fn(async (_operation: string, input: { url: string }) =>
    input.url === "https://one.test/"
      ? { ok: true, id: "one" }
      : { ok: false, error: "unsupported_url" },
  );
  vi.stubGlobal("pond", { query });
  await openLibraryAt("/folders/elsewhere");
  await act(async () => {
    await runPasteImport({
      kind: "urls",
      urls: ["https://one.test/", "https://two.test/"],
    });
  });
  expect(toastText()).toContain("Downloading");

  await act(async () => showAction()?.click());
  expect(getLibraryNav()).toEqual({ kind: "all" });
  expect(selection.snapshot()).toEqual(["one"]);
});

it("reselects the Saves once the destination publishes its results", async () => {
  stubImport({ ok: true, ids: ["a", "b"] });
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
  stubImport({ ok: false, error: "no_files" });
  await act(async () => {
    await runPasteImport({ kind: "files", paths: ["/tmp/missing.png"] });
  });
  expect(toastText()).toContain("Couldn't save to Pond");
  expect(showAction()).toBeUndefined();
});

it("stays quiet when the import was cancelled", async () => {
  stubImport({ ok: false, reason: "cancelled" });
  await act(async () => {
    await runPasteImport({ kind: "clipboard" });
  });
  expect(toastText()).toBe("");
  expect(showAction()).toBeUndefined();
});
