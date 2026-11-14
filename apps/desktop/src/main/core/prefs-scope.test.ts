import { PrefsSchema, type SyncAccounts } from "@pond/schema/db";
import { describe, expect, it } from "vitest";
import {
  mergeAppSlice,
  mergePondSlice,
  normalizeStoredPrefs,
  splitPrefsPatch,
} from "./prefs-scope";

it("keeps All and Trash visible in the sidebar", () => {
  const prefs = PrefsSchema.parse({
    sidebar: {
      destinations: {
        all: false,
        trash: false,
        random: false,
      },
    },
  });

  expect(prefs.sidebar.destinations.all).toBe(true);
  expect(prefs.sidebar.destinations.trash).toBe(true);
  expect(prefs.sidebar.destinations.random).toBe(false);
});

it("completes saved destination order", () => {
  const prefs = PrefsSchema.parse({
    sidebar: { order: ["trash", "all", "trash"] },
  });

  expect(prefs.sidebar.badgeStyle).toBe("count");
  expect(prefs.sidebar.order).toEqual([
    "trash",
    "sources",
    "downloads",
    "all",
    "uncategorized",
    "untagged",
    "recentlyAdded",
    "recentlyUsed",
    "tags",
    "random",
    "splitPosts",
  ]);
});

it("keeps a saved sidebar layout that names a retired destination", () => {
  const prefs = PrefsSchema.parse({
    sidebar: {
      order: ["trash", "assistant", "all"],
      badgeOverrides: { assistant: "none", trash: "none" },
    },
  });

  expect(prefs.sidebar.order.slice(0, 2)).toEqual(["trash", "sources"]);
  expect(prefs.sidebar.order).not.toContain("assistant");
  expect(prefs.sidebar.badgeOverrides).toEqual({ trash: "none" });
});

describe("splitPrefsPatch", () => {
  it("routes appearance (preferences) to the library slice", () => {
    const { app, pond } = splitPrefsPatch({
      preferences: { lightPresetId: "mint" },
      window: { restorePosition: false },
    });
    expect(pond).toEqual({ preferences: { lightPresetId: "mint" } });
    expect(app).toEqual({ window: { restorePosition: false } });
  });

  it("keeps feedback and sidebar behavior in the app slice", () => {
    const { app, pond } = splitPrefsPatch({
      window: { interfaceZoom: 150 },
      sidebar: { badgeStyle: "none" },
      feedback: {
        sounds: { saveDeletion: false },
        notifications: { autoImport: false },
      },
    });
    expect(app).toMatchObject({
      window: { interfaceZoom: 150 },
      sidebar: { badgeStyle: "none" },
      feedback: {
        sounds: { saveDeletion: false },
        notifications: { autoImport: false },
      },
    });
    expect(pond).toEqual({});
  });

  it("keeps the setup acknowledgement with this computer, not the library", () => {
    expect(PrefsSchema.parse({}).setup.version).toBe(0);
    const { app, pond } = splitPrefsPatch({ setup: { version: 1 } });
    expect(app).toEqual({ setup: { version: 1 } });
    expect(pond).toEqual({});
    expect(mergeAppSlice({}, app).setup.version).toBe(1);
  });

  it("keeps seen notices with the library, since each library has its own saves to announce", () => {
    expect(PrefsSchema.parse({}).notices.seen).toEqual([]);
    const { app, pond } = splitPrefsPatch({
      notices: { seen: ["arena-links-web-pages"] },
    });
    expect(app).toEqual({});
    expect(pond).toEqual({ notices: { seen: ["arena-links-web-pages"] } });
    expect(mergePondSlice({}, pond).notices.seen).toEqual([
      "arena-links-web-pages",
    ]);
  });
});

describe("normalizeStoredPrefs", () => {
  it("passes a v3 blob through untouched", () => {
    const stored = { version: 3 as const, app: { window: {} }, pending: null };
    expect(normalizeStoredPrefs(stored)).toBe(stored);
  });

  it("falls back to empty slices for unrecognized input", () => {
    const stored = normalizeStoredPrefs("garbage");
    expect(stored).toEqual({ version: 3, app: {}, pending: null });
  });
});

describe("mergePondSlice (sync account registry)", () => {
  const account: SyncAccounts[string] = {
    id: "01ACCOUNT",
    source: "twitter",
    handle: "personal",
    identityKey: "783214",
    label: null,
    addedAt: "2026-01-01T00:00:00.000Z",
    sync: {
      lastSyncedAt: null,
      lastError: null,
      highWaterMark: null,
      lastFullSyncAt: null,
      knownCount: 0,
      runningSince: null,
    },
  };

  it("keeps the account registry intact across unrelated sync patches", () => {
    const base = {
      sync: { accounts: { [account.id]: account } },
    };
    const next = mergePondSlice(base, {
      sync: { cron: { enabled: false, intervalHours: 12 } },
    });
    expect(next.sync.accounts).toEqual({ [account.id]: account });
    expect(next.sync.cron).toEqual({ enabled: false, intervalHours: 12 });
  });

  it("drops accounts for a source Pond doesn't know", () => {
    const prefs = PrefsSchema.parse({
      sync: {
        accounts: {
          [account.id]: account,
          "02GONE": { ...account, id: "02GONE", source: "gone" },
        },
      },
    });
    expect(prefs.sync.accounts).toEqual({ [account.id]: account });
  });
});

it("persists shortcut and viewer patches while allowing overrides to be reset", () => {
  const first = mergeAppSlice(
    {},
    {
      shortcuts: { profile: "eagle", overrides: { "save.add-tag": "Alt+T" } },
      viewer: {},
    },
  );
  expect(first.shortcuts).toEqual({
    profile: "eagle",
    overrides: { "save.add-tag": "Alt+T" },
  });
  const second = mergeAppSlice(first, { shortcuts: { overrides: {} } });
  expect(second.shortcuts).toEqual({ profile: "eagle", overrides: {} });
  expect(
    splitPrefsPatch({ shortcuts: second.shortcuts }).app.shortcuts,
  ).toEqual(second.shortcuts);
});

it("keeps independent folder presentations in the portable library slice", () => {
  const first = mergePondSlice(
    {},
    {
      folderViews: {
        a: { layout: "grid", sortKey: "manual", manualOrder: ["two", "one"] },
      },
    },
  );
  const next = mergePondSlice(first, {
    folderViews: { b: { layout: "list", randomSeed: "seed-b" } },
  });
  expect(next.folderViews.a).toMatchObject({
    layout: "grid",
    sortKey: "manual",
    manualOrder: ["two", "one"],
  });
  expect(next.folderViews.b).toMatchObject({
    layout: "list",
    randomSeed: "seed-b",
  });
  const split = splitPrefsPatch({ folderViews: next.folderViews });
  expect(split.pond.folderViews).toEqual(next.folderViews);
  expect(split.app).not.toHaveProperty("folderViews");
});

it("keeps Saved View presentations in the portable library slice", () => {
  const next = mergePondSlice(
    {},
    {
      savedViewViews: {
        reading: {
          icon: "bookmark",
          color: "blue",
          quickAccess: true,
          quickAccessOrder: 0,
        },
      },
    },
  );
  expect(next.savedViewViews.reading).toEqual({
    icon: "bookmark",
    color: "blue",
    quickAccess: true,
    quickAccessOrder: 0,
  });
  const split = splitPrefsPatch({ savedViewViews: next.savedViewViews });
  expect(split.pond.savedViewViews).toEqual(next.savedViewViews);
  expect(split.app).not.toHaveProperty("savedViewViews");
});

it("keeps automatic folder rules portable and isolated to their library", () => {
  const first = mergePondSlice(
    {},
    { folderRules: { a: { automaticTags: ["Work"] } } },
  );
  const next = mergePondSlice(first, {
    folderRules: { b: { automaticTags: ["Print"] } },
  });
  expect(next.folderRules).toEqual({
    a: { automaticTags: ["Work"] },
    b: { automaticTags: ["Print"] },
  });
  const split = splitPrefsPatch({ folderRules: next.folderRules });
  expect(split.pond.folderRules).toEqual(next.folderRules);
  expect(split.app).not.toHaveProperty("folderRules");
});

it("deep-merges app feedback and sidebar destination preferences", () => {
  const next = mergeAppSlice(
    {
      feedback: {
        sounds: { saveDeletion: false },
        notifications: { autoImport: false },
      },
      sidebar: { destinations: { random: false } },
    },
    {
      feedback: {
        sounds: { folderDeletion: false },
        notifications: { extensionCapture: false },
      },
      sidebar: { destinations: { sources: false } },
    },
  );

  expect(next.feedback.sounds).toMatchObject({
    saveDeletion: false,
    folderDeletion: false,
  });
  expect(next.feedback.notifications).toMatchObject({
    autoImport: false,
    extensionCapture: false,
  });
  expect(next.sidebar.destinations).toMatchObject({
    random: false,
    sources: false,
  });
});

it("keeps browser extension settings with this computer and merges site flags", () => {
  const { app, pond } = splitPrefsPatch({
    extension: { enabled: { twitter: false } },
  });
  expect(app).toEqual({ extension: { enabled: { twitter: false } } });
  expect(pond).toEqual({});

  const next = mergeAppSlice(app, {
    extension: { enabled: { reddit: false }, altClick: false },
  });
  expect(next.extension.enabled).toEqual({ twitter: false, reddit: false });
  expect(next.extension.altClick).toBe(false);
  expect(next.extension.askDetails).toBe(true);
});
