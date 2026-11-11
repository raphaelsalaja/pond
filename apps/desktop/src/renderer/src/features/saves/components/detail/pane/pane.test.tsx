import "@/app/effects/save-library-bridge";
import { EMPTY_QUERY } from "@pond/schema/filters/types";
import { mediaEmbeddingVersion } from "@shared/embeddings";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { libraryChrome } from "@/features/library";
import {
  getViewState,
  resetFilters,
  setQuery,
} from "@/features/library/state/view-store";
import { normalise, SavePatchSchema } from "@/features/saves/lib/reconcile";
import { pool } from "@/features/saves/state/pool";
import { setSaveViewerFileIndex } from "@/features/saves/state/save-viewer";
import { primarySelection } from "@/features/saves/state/selection";
import { setAppRouter } from "@/shared/lib/app-router";
import { SaveInspector } from ".";

let host: HTMLDivElement;
let root: Root;
const requests: Array<{
  name: string;
  input: Record<string, string | string[] | number>;
}> = [];
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  pool.clear();
  setSaveViewerFileIndex(null);
  requests.length = 0;
  vi.stubGlobal("pond", {
    onSyncAction: () => () => {},
    query: async (
      name: string,
      input: Record<string, string | string[] | number>,
    ) => {
      requests.push({ name, input });
      if (
        name === "folders.list" ||
        name === "folders.memberships" ||
        name === "tags.list" ||
        name === "tagGroups.list"
      )
        return [];
      if (name === "folders.create") return { id: "created" };
      if (name === "saves.rawJson")
        return {
          rawJson:
            pool.get(z.object({ id: z.string() }).parse(input).id)?.rawJson ??
            null,
        };
      if (name === "saves.getMany")
        return [
          SavePatchSchema.parse({
            id: "cold",
            notes: "Other",
            source: "local",
            url: "https://other.test",
            tags: ["Shared"],
            fileSize: 2048,
          }),
        ];
      return { changed: 2 };
    },
  });
  const save = normalise(
    SavePatchSchema.parse({
      id: "a",
      title: "Screenshot",
      description: "Captured page description",
      source: "local",
      notes: "First",
      url: "https://example.test",
      tags: ["Shared", "One"],
      rating: 3,
      width: 640,
      height: 480,
      fileSize: 1024,
    }),
  );
  if (!save) throw new Error("Invalid Save fixture");
  pool.upsert(save);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  pool.clear();
  setSaveViewerFileIndex(null);
  libraryChrome.setNav({ kind: "all" });
  resetFilters();
  vi.unstubAllGlobals();
});

function setInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

it("loads the complete selection before displaying mixed notes, tags and total size", async () => {
  await act(async () =>
    root.render(
      <SaveInspector
        saveId="a"
        saveIds={["a", "cold"]}
        folders={[{ id: "folder", name: "Inspiration", count: 1 }]}
      />,
    ),
  );
  expect(requests).toContainEqual({
    name: "saves.getMany",
    input: { ids: ["cold"] },
  });
  expect(host.textContent).toContain("One1/2");
  expect(host.textContent).toContain("Inspiration1/2");
  expect(
    host.querySelector<HTMLTextAreaElement>('[aria-label="Notes"]')
      ?.placeholder,
  ).toBe("Multiple notes");
  const title = host.querySelector<HTMLTextAreaElement>('[aria-label="Title"]');
  const description = host.querySelector<HTMLTextAreaElement>(
    '[aria-label="Description"]',
  );
  expect(title?.disabled).toBe(true);
  expect(title?.placeholder).toBe("Multiple titles");
  expect(description?.disabled).toBe(true);
  expect(description?.placeholder).toBe("Multiple descriptions");

  expect(host.textContent).toContain("2 items selected");
  expect(host.textContent).toContain("3 KiB");
  expect(host.textContent).not.toContain("Dimensions");
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="Source URL"]'),
  ).toBeNull();
});

it("uses available thumbnails for the multi-selection stack before title fallbacks", async () => {
  const missing = normalise(
    SavePatchSchema.parse({
      id: "missing-preview",
      title: "Missing preview",
      source: "local",
      files: [],
    }),
  );
  if (!missing) throw new Error("Invalid missing preview fixture");
  pool.upsert(missing);

  const ids = [missing.id];
  for (let index = 1; index <= 4; index++) {
    const save = normalise(
      SavePatchSchema.parse({
        id: `preview-${index}`,
        title: `Preview ${index}`,
        source: "local",
        files: [
          {
            kind: "original",
            path: `preview-${index}.jpg`,
            sha256: `0123456789abcde${index}`,
            size: 1024,
            mimeType: "image/jpeg",
          },
        ],
      }),
    );
    if (!save) throw new Error(`Invalid preview ${index} fixture`);
    pool.upsert(save);
    ids.push(save.id);
  }

  await act(async () =>
    root.render(<SaveInspector saveId={ids[0] ?? ""} saveIds={ids} />),
  );

  expect(host.querySelectorAll("figure img")).toHaveLength(4);
  expect(host.textContent).not.toContain("Missing preview");
});

it("shows the name, URL, source card, and note on one card", async () => {
  const current = pool.get("a");
  if (!current) throw new Error("Missing Save fixture");
  pool.upsert({
    ...current,
    source: "twitter",
    author: "Example Author",
    notes: null,
    rawJson: {
      extractorId: "test",
      extractedAt: "2026-01-01T00:00:00.000Z",
      capture: {
        id: "a",
        source: "twitter",
        url: "https://example.test",
        media: [],
        metrics: { likes: 42, views: 120 },
      },
    },
  });
  await act(async () => root.render(<SaveInspector saveId="a" />));
  const title = host.querySelector<HTMLTextAreaElement>('[aria-label="Title"]');
  expect(title?.value).toBe("Screenshot");
  expect(title?.readOnly).toBe(false);
  expect(title?.placeholder).toBe("Untitled");
  expect(title?.closest('[data-slot="root"]')).toMatchObject({
    dataset: { size: "sm", variant: "secondary" },
  });
  expect(host.textContent).toContain("Name");
  const url = host.querySelector<HTMLInputElement>('[aria-label="Source URL"]');
  expect(url?.readOnly).toBe(false);
  expect(url?.value).toBe("https://example.test");
  expect(host.querySelector('[aria-label="Open Source URL"]')).not.toBeNull();

  const card = host.querySelector('[aria-label="Source"]');
  expect(card?.textContent).toContain("Example Author");
  expect(card?.textContent).toContain("Open");
  expect(card?.textContent).toContain("Captured page description");
  expect(card?.querySelector('[aria-label="Description"]')).toBeNull();

  expect(
    host.querySelector<HTMLTextAreaElement>('[aria-label="Notes"]')
      ?.placeholder,
  ).toBe("Add a note");

  expect(
    [...host.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent),
  ).toEqual(["Details", "Related"]);
  expect(host.querySelector('[aria-label="Save Info"]')).toBeNull();
  const sectionButtons = [...host.querySelectorAll("button")].filter(
    (button) => button.getAttribute("aria-expanded") !== null,
  );
  expect(sectionButtons.map((button) => button.textContent)).toEqual(
    expect.arrayContaining(["Tags", "Properties", "Activity"]),
  );
  expect(sectionButtons.map((button) => button.textContent)).not.toContain(
    "Source",
  );
  expect(host.textContent).toContain("Folders");
  expect(host.querySelector('[aria-label="Add Tag"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Add Folder"]')).not.toBeNull();

  const tagsTrigger = sectionButtons.find(
    (button) => button.textContent === "Tags",
  );
  if (!tagsTrigger) throw new Error("Missing Tags section trigger");
  await act(async () => tagsTrigger.click());
  expect(tagsTrigger.getAttribute("aria-expanded")).toBe("false");

  expect(host.textContent).toContain("Likes42");
  expect(host.textContent).toContain("Views120");
  expect(host.textContent).toContain("Rating");
  expect(host.textContent).toContain("Saved");
  expect(host.textContent).toContain("Modified");
  expect(host.textContent).toContain("Dimensions640 × 480");
  expect(host.textContent).toContain("IDa");
  expect(host.textContent).not.toContain("Additional Details");
  expect(host.querySelector("details:not([open])")).toBeNull();
  expect(
    [...host.querySelectorAll("button")].some(
      (button) => button.textContent?.trim() === "Export",
    ),
  ).toBe(false);
});

it("shows Description as read-only text and hides an empty source card", async () => {
  const current = pool.get("a");
  if (!current) throw new Error("Missing Save fixture");
  pool.upsert({ ...current, description: current.title });

  await act(async () => root.render(<SaveInspector saveId="a" />));

  const card = () => host.querySelector('[aria-label="Source"]');
  expect(card()?.textContent).toContain("Screenshot");
  expect(card()?.querySelector("textarea")).toBeNull();

  await act(async () => {
    pool.upsert({ ...current, description: null });
  });
  expect(card()).toBeNull();

  await act(async () => {
    pool.upsert({ ...current, author: "Example Author", description: null });
  });
  expect(card()?.textContent).toContain("Example Author");
  expect(card()?.querySelector("p")).toBeNull();

  await act(async () => {
    pool.upsert({ ...current, title: null, description: null });
  });
  expect(
    host.querySelector<HTMLTextAreaElement>('[aria-label="Title"]')
      ?.placeholder,
  ).toBe("Untitled");
});

it("hides empty read-only sections and keeps empty addable sections static", async () => {
  const current = pool.get("a");
  if (!current) throw new Error("Missing Save fixture");
  pool.upsert({
    ...current,
    tags: [],
    rawJson: null,
    author: null,
  });

  await act(async () => root.render(<SaveInspector saveId="a" />));

  const sectionButtons = [...host.querySelectorAll("button")].filter(
    (button) => button.getAttribute("aria-expanded") !== null,
  );
  expect(sectionButtons.map((button) => button.textContent)).not.toEqual(
    expect.arrayContaining(["Tags", "Folders", "Activity"]),
  );
  expect(host.textContent).toContain("Tags");
  expect(host.textContent).toContain("Folders");
  expect(host.querySelector('[aria-label="Add Tag"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Add Folder"]')).not.toBeNull();
});

it("removes only the clicked folder immediately for every selected Save", async () => {
  await act(async () =>
    root.render(
      <SaveInspector
        saveId="a"
        saveIds={["a", "cold"]}
        folders={[{ id: "folder", name: "Inspiration", count: 1 }]}
      />,
    ),
  );
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        '[aria-label="Remove folder Inspiration"]',
      )
      ?.click(),
  );
  expect(requests).toContainEqual({
    name: "folders.assign",
    input: { saveIds: ["a", "cold"], addIds: [], removeIds: ["folder"] },
  });
  expect(host.textContent).not.toContain("Apply");
});

it("does not expose a local Save's internal identity as a source link", async () => {
  const current = pool.get("a");
  if (!current) throw new Error("Missing Save fixture");
  pool.upsert({ ...current, url: "pond:local/a" });
  await act(async () => root.render(<SaveInspector saveId="a" />));
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="Source URL"]')?.value,
  ).toBe("");
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="Source URL"]')
      ?.placeholder,
  ).toBe("No source URL");
});

it("shows enrichment output and applies suggested tags", async () => {
  const current = pool.get("a");
  if (!current) throw new Error("Missing Save fixture");
  pool.upsert({
    ...current,
    caption: "A dashboard with charts",
    captionModel: "florence",
    ocrText: "Revenue 42%",
    ocrModel: "florence",
    suggestedTags: ["Dashboard", "One"],
    sensitiveScore: 0.99,
  });
  await act(async () => root.render(<SaveInspector saveId="a" />));

  expect(host.textContent).toContain("Likely sensitive content");
  expect(host.textContent).toContain("A dashboard with charts");
  expect(host.textContent).toContain("Revenue 42%");
  expect(host.querySelector('[aria-label="Copy Caption"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Add tag Dashboard"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Add tag One"]')).toBeNull();

  const applyAll = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Apply All",
  );
  if (!applyAll) throw new Error("Missing Apply All");
  await act(async () => applyAll.click());
  expect(requests).toContainEqual({
    name: "saves.bulkEdit",
    input: { ids: ["a"], operation: { kind: "suggested-tags" } },
  });
});

it("clears a sensitive flag from the warning", async () => {
  const current = pool.get("a");
  if (!current) throw new Error("Missing Save fixture");
  pool.upsert({
    ...current,
    sensitiveScore: 0.99,
    sensitiveModel: "model@revision",
  });
  await act(async () => root.render(<SaveInspector saveId="a" />));
  const flag = host.querySelector<HTMLElement>(
    '[data-band="likely-sensitive"]',
  );
  if (!flag) throw new Error("Missing sensitive flag");
  await act(async () => {
    flag.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 12,
        clientY: 12,
      }),
    );
  });
  const action = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]'),
  ].find((item) => item.textContent?.includes("Sensitive Content"));
  if (!action) throw new Error("Missing Sensitive Content action");
  expect(action.getAttribute("aria-checked")).toBe("true");
  await act(async () => action.click());
  expect(pool.get("a")?.sensitiveScore).toBe(0);
  expect(pool.get("a")?.sensitiveModel).toBe("manual:not-sensitive");
  expect(requests).toContainEqual({
    name: "saves.patchDerived",
    input: {
      id: "a",
      patch: {
        sensitiveScore: 0,
        sensitiveModel: "manual:not-sensitive",
      },
    },
  });
});

it("assigns a mixed folder immediately from the inspector menu", async () => {
  await act(async () =>
    root.render(
      <SaveInspector
        saveId="a"
        saveIds={["a", "cold"]}
        folders={[{ id: "folder", name: "Inspiration", count: 1 }]}
      />,
    ),
  );
  const trigger = host.querySelector<HTMLButtonElement>(
    '[aria-label="Add Folder"]',
  );
  if (!trigger) throw new Error("Missing Add Folder");
  await act(async () => trigger.click());
  const checkbox = document.querySelector<HTMLElement>(
    '[role="menuitemcheckbox"]',
  );
  if (!checkbox) throw new Error("Missing folder checkbox");
  expect(checkbox.dataset.selection).toBe("mixed");
  expect(checkbox.getAttribute("aria-description")).toBe("Some selected");
  await act(async () => checkbox.click());
  expect(requests).toContainEqual({
    name: "folders.assign",
    input: { saveIds: ["a", "cold"], addIds: ["folder"], removeIds: [] },
  });
});

it("shows an assigned nested folder as one breadcrumb with its full path", async () => {
  await act(async () =>
    root.render(
      <SaveInspector
        saveId="a"
        folders={[
          { id: "parent", name: "Knowledge Base", count: 0 },
          { id: "child", name: "Design", parentId: "parent", count: 1 },
        ]}
      />,
    ),
  );
  const chip = host.querySelector<HTMLElement>(
    '[title="Knowledge Base / Design"]',
  );
  expect(chip?.textContent).toContain("Knowledge Base");
  expect(chip?.textContent).toContain("›");
  expect(chip?.textContent).toContain("Design");
  expect(
    host.querySelector('[aria-label="Remove folder Knowledge Base / Design"]'),
  ).not.toBeNull();
});

it("lists folders with their parent as a breadcrumb and filters by search", async () => {
  await act(async () =>
    root.render(
      <SaveInspector
        saveId="a"
        folders={[
          { id: "parent", name: "Reference", count: 0 },
          {
            id: "child",
            name: "A very long collection name that needs truncation",
            parentId: "parent",
            count: 0,
          },
          { id: "standalone", name: "Loose Saves", count: 0 },
        ]}
      />,
    ),
  );
  const trigger = host.querySelector<HTMLButtonElement>(
    '[aria-label="Add Folder"]',
  );
  if (!trigger) throw new Error("Missing Add Folder");
  await act(async () => trigger.click());
  const rows = () => [
    ...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]'),
  ];
  expect(rows()).toHaveLength(3);

  const search = document.querySelector<HTMLInputElement>(
    '[aria-label="Search Folders"]',
  );
  if (!search) throw new Error("Missing folder search");
  await act(async () => setInput(search, "collection"));
  expect(rows()).toHaveLength(1);
  expect(rows()[0]?.querySelector("[title]")?.getAttribute("title")).toBe(
    "Reference › A very long collection name that needs truncation",
  );
});

it("creates a folder from the search text", async () => {
  await act(async () =>
    root.render(
      <SaveInspector
        saveId="a"
        folders={[{ id: "folder", name: "Inspiration", count: 0 }]}
      />,
    ),
  );
  const trigger = host.querySelector<HTMLButtonElement>(
    '[aria-label="Add Folder"]',
  );
  if (!trigger) throw new Error("Missing Add Folder");
  await act(async () => trigger.click());
  const search = document.querySelector<HTMLInputElement>(
    '[aria-label="Search Folders"]',
  );
  if (!search) throw new Error("Missing folder search");
  await act(async () => setInput(search, "Moodboard"));
  const create = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ].find((item) => item.textContent === "Create “Moodboard”");
  if (!create) throw new Error("Missing create row");
  await act(async () => create.click());
  expect(requests).toContainEqual({
    name: "folders.create",
    input: { name: "Moodboard" },
  });
});

it("explains why Related is empty before the save is indexed", async () => {
  await act(async () => root.render(<SaveInspector saveId="a" />));
  const tab = [
    ...host.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ].find((entry) => entry.textContent === "Related");
  if (!tab) throw new Error("Missing Related tab");
  await act(async () => tab.click());
  expect(host.querySelector('[role="status"]')?.textContent).toContain(
    "Not indexed yet",
  );
  expect(requests.some((request) => request.name === "saves.related")).toBe(
    false,
  );
});

it("loads Related Saves only when its tab opens and opens a selected Save", async () => {
  const current = pool.get("a");
  if (!current) throw new Error("Missing Save fixture");
  pool.upsert({ ...current, clipModel: mediaEmbeddingVersion() });
  const query = vi.fn(
    async (name: string, input: Record<string, string | string[] | number>) => {
      requests.push({ name, input });
      if (name === "saves.related") {
        return {
          items: [
            {
              id: "related",
              score: 0.9,
              reason: "semantically-related",
            },
          ],
        };
      }
      if (name === "saves.getMany") {
        return [
          SavePatchSchema.parse({
            id: "related",
            title: "Related Save",
            source: "local",
            url: "pond:local/related",
            mediaType: "image",
            files: [
              {
                kind: "original",
                path: "related.jpg",
                mimeType: "image/jpeg",
                sha256: "0123456789abcdef",
                size: 1024,
              },
            ],
          }),
        ];
      }
      if (name === "saves.rawJson") return { rawJson: null };
      return [];
    },
  );
  vi.stubGlobal("pond", { query });

  await act(async () => root.render(<SaveInspector saveId="a" />));
  expect(query).not.toHaveBeenCalledWith("saves.related", expect.anything());

  const trigger = [
    ...host.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ].find((tab) => tab.textContent === "Related");
  if (!trigger) throw new Error("Missing Related tab");
  expect(trigger.getAttribute("aria-selected")).toBe("false");
  await act(async () => trigger.click());
  expect(trigger.getAttribute("aria-selected")).toBe("true");
  expect(host.textContent).not.toContain("Properties");

  expect(query).toHaveBeenCalledWith("saves.related", { id: "a", limit: 12 });
  expect(
    query.mock.calls.every(([name]) =>
      ["saves.rawJson", "saves.related", "saves.getMany"].includes(name),
    ),
  ).toBe(true);
  const related = host.querySelector<HTMLButtonElement>(
    '[aria-label="Open Related Save"]',
  );
  expect(related).not.toBeNull();
  await act(async () => related?.click());
  expect(primarySelection.get()).toBe("related");
});

it("opens tagged saves from a tag chip without removing the tag", async () => {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  const saveRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/save/$id",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, saveRoute]),
    history: createMemoryHistory({ initialEntries: ["/save/a"] }),
  });
  await router.load();
  setAppRouter(router);
  libraryChrome.setNav({ kind: "all" });
  setQuery({
    combinator: "and",
    rules: [{ field: "tags", operator: "some", value: ["Other"] }],
  });

  await act(async () => root.render(<SaveInspector saveId="a" />));
  const remove = host.querySelector<HTMLButtonElement>(
    '[aria-label="Remove tag One"]',
  );
  const tag = [...host.querySelectorAll("span")].find(
    (node) => node.textContent === "One" && node.children.length === 0,
  );
  if (!remove || !tag) throw new Error("Missing tag One");

  await act(async () => remove.click());
  expect(requests).toContainEqual({
    name: "saves.bulkEdit",
    input: {
      ids: ["a"],
      operation: { kind: "tags", tags: ["One"], mode: "remove" },
    },
  });
  expect(libraryChrome.getState().nav).toEqual({ kind: "all" });
  expect(router.state.location.pathname).toBe("/save/a");

  const callsBeforeOpen = requests.length;
  await act(async () => tag.click());
  expect(requests).toHaveLength(callsBeforeOpen);
  expect(libraryChrome.getState().nav).toEqual({ kind: "tag", name: "One" });
  expect(router.history.location.pathname).toBe("/");
  expect(getViewState().query).toEqual(EMPTY_QUERY);
});

it("clamps a long source description behind Read More and sizes the source icon", async () => {
  const scroll = vi
    .spyOn(HTMLParagraphElement.prototype, "scrollHeight", "get")
    .mockReturnValue(400);
  await act(async () => root.render(<SaveInspector saveId="a" />));

  const card = host.querySelector('[aria-label="Source"]');
  const body = [...(card?.querySelectorAll("p") ?? [])].find(
    (paragraph) => paragraph.textContent === "Captured page description",
  );
  const more = [...(card?.querySelectorAll("button") ?? [])].find(
    (button) => button.textContent === "Read More",
  );
  expect(body?.hasAttribute("data-clamped")).toBe(true);
  expect(card?.querySelector("footer svg")?.getAttribute("width")).toBe("14");

  await act(async () => more?.click());

  expect(body?.hasAttribute("data-clamped")).toBe(false);
  expect(card?.textContent).not.toContain("Read More");
  scroll.mockRestore();
});
