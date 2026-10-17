import type { MenuItemSpec } from "@pond/ui";
import { afterEach, describe, expect, it } from "vitest";
import type { CardModel } from "@/features/sources/components/sync-monitor/lib/helpers";
import type { AccountRow } from "@/features/sources/hooks/use-accounts";
import type { WatchRow } from "@/features/sources/hooks/use-watches";
import { sourcesSelection } from "@/features/sources/state/sources-selection";
import { menuLabels as visibleLabels } from "@/shared/test/menu-labels";
import { toSourceTableRow } from "./helpers";
import { buildSourceMenu, contextMenuSources } from "./menu";

function findItem(items: MenuItemSpec[], label: string): MenuItemSpec | null {
  for (const item of items) {
    if ("label" in item && item.label === label) return item;
    if (item.type === "submenu" || item.type === "group") {
      const child = findItem(item.items, label);
      if (child) return child;
    }
  }
  return null;
}

const ready: CardModel = {
  tone: "ok",
  statusText: "Synced",
  connected: true,
  meta: "Manual",
  lastText: "3 minutes ago",
};

const running: CardModel = {
  ...ready,
  tone: "run",
  statusText: "Syncing",
  lastText: "now",
};

function account(id: string, model: CardModel = ready) {
  const row: AccountRow = {
    id,
    source: "instagram",
    handle: "oluwa.rafa",
    label: null,
    avatarUrl: null,
    addedAt: "",
    sync: { lastSyncedAt: null, lastError: null, knownCount: 4224 },
    connected: true,
    syncing: false,
  };
  return toSourceTableRow({ kind: "account", row }, model);
}

function watch(id: string) {
  const row: WatchRow = {
    id,
    source: "twitter",
    handle: "raphaelsalaja",
    kind: "list",
    label: null,
    avatarUrl: null,
    via: null,
    addedAt: "",
    sync: { lastSyncedAt: null, lastError: null, knownCount: 8 },
    syncing: false,
  };
  return toSourceTableRow({ kind: "watch", row }, ready);
}

afterEach(() => {
  sourcesSelection.clear();
});

describe("contextMenuSources", () => {
  it("uses the whole selection when the clicked source is already selected", () => {
    const first = account("first");
    const second = account("second");
    sourcesSelection.set([first, second]);
    expect(contextMenuSources(first).map((row) => row.id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("uses only the clicked source when it is not in the selection", () => {
    const first = account("first");
    const second = account("second");
    sourcesSelection.set([second]);
    expect(contextMenuSources(first).map((row) => row.id)).toEqual(["first"]);
  });
});

describe("buildSourceMenu", () => {
  it("shows account actions for a single account", () => {
    expect(visibleLabels(buildSourceMenu(account("acc")))).toEqual([
      "Open Instagram Profile",
      "Show Saved Items",
      "Copy Profile Link",
      "Copy Username",
      "Copy Connection ID",
      "Fetch New Saves",
      "Choose What to Import",
      "Fetch Older Saves",
      "Fetch Save Details",
      "Fetch Original Media",
      "Sign In Again",
      "Disconnect Instagram",
    ]);
  });

  it("shows complete collection actions for a watched source", () => {
    expect(visibleLabels(buildSourceMenu(watch("watch")))).toEqual([
      "Open Twitter List",
      "Show Saved Items",
      "Copy List Link",
      "Copy List ID",
      "Copy Connection ID",
      "Fetch New Saves",
      "Stop Watching",
    ]);
  });

  it("keeps only safe actions for a mixed selection", () => {
    expect(
      visibleLabels(buildSourceMenu([account("acc"), watch("watch")])),
    ).toEqual(["Show Saved Items", "Fetch New Saves"]);
  });

  it("keeps only safe actions for a watched-only selection", () => {
    expect(
      visibleLabels(buildSourceMenu([watch("one"), watch("two")])),
    ).toEqual(["Show Saved Items", "Fetch New Saves"]);
  });

  it("disables Fetch New Saves when none of the selection can sync", () => {
    const row = account("busy", running);
    expect(
      findItem(buildSourceMenu([row, row]), "Fetch New Saves"),
    ).toMatchObject({ label: "Fetch New Saves", disabled: true });
  });
});
