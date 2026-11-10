import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useTagGroups } from "./tag-groups";

type SyncHandler = (event: { modelName: string; action: string }) => void;

const rows = [
  {
    id: "design",
    name: "Design",
    description: null,
    color: null,
    sortOrder: 0,
    collapsed: false,
    tagIds: [],
    tagNames: [],
  },
];

let handler: SyncHandler | null = null;
let listCalls = 0;
let releaseRefetch: (() => void) | null = null;

const query = vi.fn((name: string) => {
  if (name !== "tagGroups.list") return Promise.resolve([]);
  listCalls += 1;
  if (listCalls === 1) return Promise.resolve(rows);
  return new Promise((resolve) => {
    releaseRefetch = () => resolve(rows);
  });
});

vi.stubGlobal("pond", {
  query,
  onSyncAction(callback: SyncHandler) {
    handler = callback;
    return () => {};
  },
});

function Harness() {
  const groups = useTagGroups();
  return <span>{groups.map((group) => group.name).join(",")}</span>;
}

it("keeps the group list on screen while a membership change refetches", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Harness />));
    expect(host.textContent).toBe("Design");
    if (!handler) throw new Error("Tag groups never subscribed to sync events");

    await act(async () => {
      handler?.({ modelName: "tag_group_member", action: "I" });
      await Promise.resolve();
    });

    // A page keeps its selected group by id. If the refetch emptied the list
    // here, that page would fall back to All.
    expect(host.textContent).toBe("Design");

    releaseRefetch?.();
    await act(async () => {
      await Promise.resolve();
    });
    expect(host.textContent).toBe("Design");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
