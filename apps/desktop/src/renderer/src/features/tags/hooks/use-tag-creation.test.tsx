import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { TagEntity } from "@/features/tags/operations/tag-operations";
import { useTagCreation } from "./use-tag-creation";

function Harness({
  operations,
}: {
  operations: Parameters<typeof useTagCreation>[0];
}) {
  const creation = useTagCreation(operations);
  return (
    <>
      <button type="button" onClick={() => creation.startCreate("tag")}>
        Start
      </button>
      <button
        type="button"
        onClick={() => {
          void creation.saveCreate("Design");
          void creation.saveCreate("Design");
        }}
      >
        Commit
      </button>
      <button
        type="button"
        onClick={() => {
          creation.cancelCreate();
          void creation.saveCreate("Design");
        }}
      >
        Cancel
      </button>
      <span>{creation.creating ?? "closed"}</span>
    </>
  );
}

it("commits each draft once and cancels before blur can create it", async () => {
  const created: { kind: TagEntity; name: string }[] = [];
  const host = document.createElement("div");
  const root = createRoot(host);
  const operations = {
    async create(kind: TagEntity, name: string) {
      created.push({ kind, name });
    },
  };
  async function click(label: string) {
    const button = [...host.querySelectorAll("button")].find(
      (node) => node.textContent === label,
    );
    if (!button) throw new Error(`Missing ${label} button`);
    await act(async () => button.click());
  }
  try {
    await act(async () => root.render(<Harness operations={operations} />));
    await click("Start");
    await click("Commit");
    expect(created).toEqual([{ kind: "tag", name: "Design" }]);
    expect(host.querySelector("span")?.textContent).toBe("closed");
    await click("Start");
    await click("Cancel");
    expect(created).toHaveLength(1);
    await click("Start");
    await click("Commit");
    expect(created).toHaveLength(2);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
