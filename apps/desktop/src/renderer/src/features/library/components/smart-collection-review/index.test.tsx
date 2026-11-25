import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import { wireSave } from "@/shared/test/wire-save";
import { SmartCollectionReview } from "./";

it("rejects and closes a cluster preview without writing to the Library", async () => {
  const representatives = [
    wireSave({ id: "design-a", title: "Design A" }),
    wireSave({ id: "design-b", title: "Design B" }),
    wireSave({ id: "design-c", title: "Design C" }),
  ];
  bridge.use({
    query: {
      "saves.semanticClusters": () => ({
        clusters: [
          {
            id: "design-a",
            labels: ["Design Systems"],
            memberIds: ["design-a", "design-b", "design-c"],
          },
        ],
        unclustered: ["outlier"],
      }),
      "saves.getMany": () => representatives,
    },
  });
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
    expect(window.pond.query).not.toHaveBeenCalledWith(
      "folders.createWithSaves",
      expect.anything(),
    );
    expect(window.pond.query).not.toHaveBeenCalledWith(
      "saves.bulkEdit",
      expect.anything(),
    );
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
  bridge.use({
    query: {
      "saves.semanticClusters": () => ({
        clusters: [],
        unclustered: ["save-a", "save-b"],
      }),
      "saves.classifyLabels": () => ({
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
      }),
      "saves.bulkEdit": (input) => ({
        changed: input.ids.length,
        undoId: null,
      }),
    },
  });
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
    if (!input) throw new Error("Missing labels field");
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "Design, Research");
      input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    await act(async () => button("Preview Labels")?.click());
    await act(async () => button("Apply Labels")?.click());

    expect(window.pond.query).toHaveBeenCalledWith("saves.bulkEdit", {
      ids: ["save-a"],
      actorReason: "semantic-label-preview",
      operation: { kind: "tags", tags: ["Design"], mode: "add" },
    });
    expect(window.pond.query).toHaveBeenCalledWith("saves.bulkEdit", {
      ids: ["save-b"],
      actorReason: "semantic-label-preview",
      operation: { kind: "tags", tags: ["Research"], mode: "add" },
    });
    expect(window.pond.query).not.toHaveBeenCalledWith(
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
  bridge.use({
    query: {
      "saves.semanticClusters": () => ({
        clusters: [
          {
            id: "design-a",
            labels: ["Design Systems"],
            memberIds: ["design-a", "design-b", "design-c"],
          },
        ],
        unclustered: [],
      }),
      "saves.getMany": () => [],
      "folders.createWithSaves": () => ({
        id: "folder-design",
        parentId: null,
        name: "Design Systems",
        color: null,
        sortOrder: 0,
        createdAt: new Date(0),
        undoId: null,
      }),
      "folders.list": () => [],
      "folders.memberships": () => [],
    },
  });
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

    expect(window.pond.query).toHaveBeenCalledWith("folders.createWithSaves", {
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
  bridge.use({
    query: {
      "saves.semanticClusters": async () => {
        throw new TypeError(
          "Cannot read properties of null (reading 'clusters')",
        );
      },
    },
  });
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
