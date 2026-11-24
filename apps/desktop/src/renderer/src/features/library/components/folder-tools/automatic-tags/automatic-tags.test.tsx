import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AutomaticTagsDialog } from ".";

let host: HTMLDivElement;
let root: Root;
const query = vi.fn(async (name: string) => {
  if (name === "folders.rules.get") {
    return { tags: ["Logos"], inheritedTags: ["Brand"] };
  }
  if (name === "settings.getPrefs") {
    return PrefsSchema.parse({});
  }
  if (name === "tags.list") {
    return ["Logos", "Posters"].map((tag) => ({
      id: tag,
      name: tag,
      starred: false,
      description: null,
      lastUsedAt: null,
      usageCount: 0,
      createdAt: null,
    }));
  }
  if (name === "tagGroups.list" || name === "folders.list") {
    return [];
  }
  return { ok: true, affected: 0 };
});

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("pond", { query, onSyncAction: () => () => {} });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  query.mockClear();
  vi.unstubAllGlobals();
});

it("stages tag changes in the shared tag picker and saves them together", async () => {
  await act(async () => {
    root.render(
      <AutomaticTagsDialog
        folderId="folder"
        folderName="Branding"
        onClose={() => {}}
      />,
    );
  });
  await vi.waitFor(() =>
    expect(document.querySelector('[aria-label="Logos"]')?.ariaSelected).toBe(
      "true",
    ),
  );
  expect(document.body.textContent).toContain(
    "Inherited from parent folders: Brand",
  );
  const posters = document.querySelector<HTMLElement>('[aria-label="Posters"]');
  await act(async () => posters?.click());
  expect(query).not.toHaveBeenCalledWith(
    "folders.rules.set",
    expect.anything(),
  );
  const save = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Save",
  );
  await act(async () => save?.click());
  expect(query).toHaveBeenCalledWith("folders.rules.set", {
    id: "folder",
    tags: ["Logos", "Posters"],
    applyExisting: false,
  });
});
