import type { WireSyncAction } from "@shared/wire";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import { useTagGroups } from "./tag-groups";

const rows = [
  {
    id: "design",
    name: "Design",
    description: null,
    color: null,
    sortOrder: 0,
    collapsed: false,
    createdAt: new Date(0),
    tagIds: [],
    tagNames: [],
  },
];

const membershipChange: WireSyncAction = {
  id: 1,
  batchId: null,
  modelName: "tag_group_member",
  modelId: "design",
  action: "I",
  data: null,
  prevData: null,
  actor: "user",
  actorReason: null,
  createdAt: 0,
};

function Harness() {
  const groups = useTagGroups();
  return <span>{groups.map((group) => group.name).join(",")}</span>;
}

it("keeps the group list on screen while a membership change refetches", async () => {
  let listCalls = 0;
  const refetch = Promise.withResolvers<typeof rows>();
  bridge.use({
    query: {
      "tagGroups.list": () => {
        listCalls += 1;
        return listCalls === 1 ? rows : refetch.promise;
      },
    },
  });
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Harness />));
    expect(host.textContent).toBe("Design");
    expect(bridge.listening("onSyncAction")).toBe(true);

    await act(async () => {
      bridge.emit("onSyncAction", membershipChange);
      await Promise.resolve();
    });

    /** A page keeps its selected group by id; an emptied list would send it back to All. */
    expect(host.textContent).toBe("Design");

    refetch.resolve(rows);
    await act(async () => {
      await Promise.resolve();
    });
    expect(host.textContent).toBe("Design");
  } finally {
    await act(async () => root.unmount());
  }
});
