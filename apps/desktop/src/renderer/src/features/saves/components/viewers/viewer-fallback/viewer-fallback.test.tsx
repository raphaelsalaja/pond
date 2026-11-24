import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StoredFileViewer } from "@/features/saves/components/viewers/file-viewer";
import { ViewerChrome } from "@/features/saves/components/viewers/media-viewer/chrome";
import { pool } from "@/features/saves/state/pool";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import type { Save } from "@/features/saves/types";
import { ViewerFallback } from ".";

const save: Save = {
  id: "failed-preview",
  source: "local",
  sourceId: "failed-preview",
  url: "https://example.test/failed-preview",
  title: "Failed preview",
  description: null,
  author: null,
  notes: null,
  mediaUrl: null,
  mediaType: "image",
  files: [
    {
      path: "reference.jpg",
      kind: "image",
      mimeType: "image/jpeg",
      sha256: "fixture",
      size: 1,
    },
  ],
  tags: [],
  savedAt: 0,
  createdAt: 0,
  deletedAt: null,
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("pond", {
    openSaveFile: async () => ({ ok: true }),
    query: async () => PrefsSchema.parse({}),
    tx: async () => ({ ok: true }),
  });
  resultNavigation.setSource({
    ids: ["before", save.id, "after"],
    total: 3,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  resultNavigation.setSource({ ids: [] });
  vi.unstubAllGlobals();
});

it("keeps failure content and original actions inside the existing chrome", async () => {
  const file = save.files[0];
  if (!file) {
    throw new Error("Missing fixture file");
  }

  await act(async () => {
    root.render(
      <ViewerChrome>
        <ViewerFallback
          save={save}
          file={file}
          fileIndex={0}
          reason="preview"
        />
      </ViewerChrome>,
    );
  });

  expect(host.textContent).toContain("This preview could not be rendered.");
  expect(host.querySelector('[aria-label="Previous Save"]')).not.toBeNull();
  expect(host.textContent).not.toContain("2 / 3");
  expect(
    host.querySelector('button[aria-label="Open in Default App"]'),
  ).not.toBeNull();
  expect(
    host.querySelector('button[aria-label="Export Original"]'),
  ).not.toBeNull();
  expect(host.querySelector('[role="separator"]')).toBeNull();
  expect(host.querySelectorAll("[data-viewer-root]")).toHaveLength(1);
});

it("ends a failed generated file preview in the shared fallback", async () => {
  const documentSave: Save = {
    ...save,
    id: "failed-document-preview",
    mediaType: "file",
    files: [
      {
        path: "reference.docx",
        kind: "file",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sha256: "document-fixture",
        size: 1,
      },
    ],
  };
  const file = documentSave.files[0];
  if (!file) {
    throw new Error("Missing document fixture");
  }
  pool.upsert(documentSave);
  resultNavigation.setSource({ ids: [documentSave.id], total: 1 });

  await act(async () => {
    root.render(<StoredFileViewer save={documentSave} file={file} />);
  });

  const image = host.querySelector("img");
  if (!image) {
    throw new Error("Missing generated document preview");
  }
  await act(async () => {
    image.dispatchEvent(new Event("error", { bubbles: true }));
  });

  expect(host.textContent).toContain("This preview could not be rendered.");
  expect(
    host.querySelector('button[aria-label="Open in Default App"]'),
  ).not.toBeNull();
  expect(host.querySelectorAll("[data-viewer-root]")).toHaveLength(1);

  const replacement: Save = {
    ...documentSave,
    files: [{ ...file, path: "replacement.docx", sha256: "replacement" }],
  };
  const replacementFile = replacement.files[0];
  if (!replacementFile) {
    throw new Error("Missing replacement fixture");
  }
  pool.upsert(replacement);
  await act(async () => {
    root.render(<StoredFileViewer save={replacement} file={replacementFile} />);
  });

  expect(host.querySelector("[data-viewer-fallback]")).toBeNull();
  expect(host.querySelector("img")?.getAttribute("src")).toContain(
    "replacement.docx",
  );
});
