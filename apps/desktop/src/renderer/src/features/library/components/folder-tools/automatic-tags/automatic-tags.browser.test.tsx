import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import { AutomaticTagsDialog } from ".";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  bridge.use({
    query: {
      "folders.rules.get": () => ({
        tags: ["Logos"],
        inheritedTags: ["Brand"],
      }),
      "folders.rules.set": () => ({ ok: true, affected: 0 }),
      "settings.getPrefs": () => PrefsSchema.parse({}),
      "tags.list": () =>
        ["Logos", "Posters"].map((tag) => ({
          id: tag,
          name: tag,
          starred: false,
          archived: false,
          description: null,
          lastUsedAt: null,
          usageCount: 0,
          createdAt: new Date(0),
        })),
      "tagGroups.list": () => [],
      "folders.list": () => [],
      "folders.memberships": () => [],
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
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
  expect(window.pond.query).not.toHaveBeenCalledWith(
    "folders.rules.set",
    expect.anything(),
  );
  const save = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Save",
  );
  await act(async () => save?.click());
  expect(window.pond.query).toHaveBeenCalledWith("folders.rules.set", {
    id: "folder",
    tags: ["Logos", "Posters"],
    applyExisting: false,
  });
});
