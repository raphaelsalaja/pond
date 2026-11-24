import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SmartCollectionReview } from "./";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("rejects and closes a cluster preview without writing to the Library", async () => {
  const query = vi.fn(async (name: string) => {
    if (name === "saves.semanticClusters") {
      return {
        clusters: [
          {
            id: "design-a",
            labels: ["Design Systems"],
            memberIds: ["design-a", "design-b", "design-c"],
          },
        ],
        unclustered: ["outlier"],
      };
    }
    if (name === "saves.getMany") {
      return [
        { id: "design-a", title: "Design A" },
        { id: "design-b", title: "Design B" },
        { id: "design-c", title: "Design C" },
      ];
    }
    throw new Error(`Unexpected query: ${name}`);
  });
  vi.stubGlobal("pond", { query });
  const onClose = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(<SmartCollectionReview scopeIds={null} onClose={onClose} />),
    );
    const skip = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.trim() === "Skip");
    await act(async () => skip?.click());
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.trim() === "Done")
        ?.click(),
    );

    expect(onClose).toHaveBeenCalledOnce();
    expect(query).not.toHaveBeenCalledWith(
      "folders.createWithSaves",
      expect.anything(),
    );
    expect(query).not.toHaveBeenCalledWith("saves.bulkEdit", expect.anything());
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

it("applies accepted labels as add-only tag edits", async () => {
  const query = vi.fn(
    async (
      name: string,
      input: { saveIds?: Array<string>; ids?: Array<string> },
    ) => {
      if (name === "saves.semanticClusters") {
        return { clusters: [], unclustered: ["save-a", "save-b"] };
      }
      if (name === "saves.classifyLabels") {
        return {
          items: [
            {
              id: "save-a",
              scores: [
                { label: "Design", score: 0.91 },
                { label: "Research", score: 0.2 },
              ],
            },
            {
              id: "save-b",
              scores: [
                { label: "Research", score: 0.82 },
                { label: "Design", score: 0.1 },
              ],
            },
          ],
          excludedIds: [],
        };
      }
      if (name === "saves.bulkEdit") {
        return { changed: input.ids?.length ?? 0 };
      }
      throw new Error(`Unexpected query: ${name}`);
    },
  );
  vi.stubGlobal("pond", { query });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <SmartCollectionReview
          scopeIds={["save-a", "save-b"]}
          onClose={() => {}}
        />,
      ),
    );
    const label = [...document.querySelectorAll("label")].find(
      (candidate) => candidate.textContent === "Labels",
    );
    const input = label?.htmlFor
      ? document.querySelector<HTMLInputElement>(
          `#${CSS.escape(label.htmlFor)}`,
        )
      : null;
    if (!input) {
      throw new Error("Missing labels field");
    }
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "Design, Research");
      input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    await act(async () => button("Preview Labels")?.click());
    await act(async () => button("Apply Labels")?.click());

    expect(query).toHaveBeenCalledWith("saves.bulkEdit", {
      ids: ["save-a"],
      actorReason: "semantic-label-preview",
      operation: { kind: "tags", tags: ["Design"], mode: "add" },
    });
    expect(query).toHaveBeenCalledWith("saves.bulkEdit", {
      ids: ["save-b"],
      actorReason: "semantic-label-preview",
      operation: { kind: "tags", tags: ["Research"], mode: "add" },
    });
    expect(query).not.toHaveBeenCalledWith(
      "saves.bulkEdit",
      expect.objectContaining({
        operation: expect.objectContaining({ mode: "replace" }),
      }),
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("creates a folder only after the cluster is accepted", async () => {
  const query = vi.fn(async (name: string) => {
    if (name === "saves.semanticClusters") {
      return {
        clusters: [
          {
            id: "design-a",
            labels: ["Design Systems"],
            memberIds: ["design-a", "design-b", "design-c"],
          },
        ],
        unclustered: [],
      };
    }
    if (name === "saves.getMany") {
      return [];
    }
    if (name === "folders.createWithSaves") {
      return { id: "folder-design", name: "Design Systems" };
    }
    if (name === "folders.list" || name === "folders.memberships") {
      return [];
    }
    throw new Error(`Unexpected query: ${name}`);
  });
  vi.stubGlobal("pond", { query });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(<SmartCollectionReview scopeIds={null} onClose={() => {}} />),
    );
    const create = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.trim() === "Create Folder");
    await act(async () => create?.click());

    expect(query).toHaveBeenCalledWith("folders.createWithSaves", {
      name: "Design Systems",
      parentId: null,
      saveIds: ["design-a", "design-b", "design-c"],
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("shows product copy instead of an internal error when the preview fails", async () => {
  const query = vi.fn(async () => {
    throw new TypeError("Cannot read properties of null (reading 'clusters')");
  });
  vi.stubGlobal("pond", { query });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(<SmartCollectionReview scopeIds={null} onClose={() => {}} />),
    );

    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe(
      "Couldn't preview organization. Try again.",
    );
    expect(document.body.textContent).not.toContain("Suggested Folders");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
