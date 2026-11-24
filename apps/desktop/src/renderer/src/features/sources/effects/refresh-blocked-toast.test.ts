import type { Source } from "@pond/schema/db";
import type { WireSyncAction } from "@shared/wire";
import { beforeEach, expect, it } from "vitest";
import { normalise } from "@/features/saves/lib/reconcile";
import { pool } from "@/features/saves/state/pool";
import type { NotifyOptions } from "@/shared/lib/toast";
import { notifyRefreshBlocked } from "./refresh-blocked-toast";

let notices: Array<NotifyOptions> = [];
let connects: Array<Source> = [];
let whenConnected: (() => void) | null = null;
let refreshed: Array<string> = [];
let closed = 0;
let closedToasts: Array<string> = [];
const deps = {
  notify: (options: NotifyOptions) => {
    notices.push(options);
    return options.id;
  },
  startConnect: async (
    source: Source,
    callback: (() => void) | null = null,
  ) => {
    connects.push(source);
    whenConnected = callback;
  },
  refreshSave: (id: string) => {
    refreshed.push(id);
  },
  closeConnect: () => {
    closed += 1;
  },
  closeToast: (id: string) => {
    closedToasts.push(id);
  },
};

function action(overrides: Partial<WireSyncAction> = {}): WireSyncAction {
  return {
    id: 1,
    batchId: null,
    modelName: "save",
    modelId: "post",
    action: "U",
    data: { status: "complete" },
    prevData: null,
    actor: "system",
    actorReason: "pipeline:refresh-blocked",
    createdAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  notices = [];
  connects = [];
  whenConnected = null;
  refreshed = [];
  closed = 0;
  closedToasts = [];
  pool.clear();
  const save = normalise({
    id: "post",
    title: "A post",
    url: "https://www.instagram.com/p/abc/",
    source: "instagram",
  });
  if (!save) {
    throw new Error("Invalid save fixture");
  }
  pool.upsert(save);
});

it("asks the user to sign in to the save's source", () => {
  notifyRefreshBlocked(action(), deps);
  expect(notices).toHaveLength(1);
  expect(notices[0]?.title).toBe("Instagram needs a sign-in");
  notices[0]?.action?.onClick();
  expect(connects).toEqual(["instagram"]);
  expect(closedToasts).toEqual(["refresh-blocked"]);
  expect(refreshed).toEqual([]);
});

it("refreshes the save and closes the dialog once the sign-in succeeds", () => {
  notifyRefreshBlocked(action(), deps);
  notices[0]?.action?.onClick();
  whenConnected?.();
  expect(refreshed).toEqual(["post"]);
  expect(closed).toBe(1);
});

it("stays quiet for blocks that did not come from a refresh", () => {
  notifyRefreshBlocked(
    action({ actorReason: "pipeline:blocked-keep-files" }),
    deps,
  );
  expect(notices).toEqual([]);
});

it("stays quiet for saves that are not loaded", () => {
  notifyRefreshBlocked(action({ modelId: "missing" }), deps);
  expect(notices).toEqual([]);
});
