# Paged Library Hydration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a small, current library page immediately and retrieve later pages only as the user approaches the end of the grid.

**Architecture:** Add a cursor-based `saves.listPage` IPC query ordered by `savedAt DESC, id DESC`. The renderer pool keeps the first 250 rows and a 250-row warm snapshot, records the next cursor in a TanStack Store, and appends a page from the existing virtualized-grid visibility signal. FTS search and save detail retain `saves.getMany`, so they can hydrate cold rows directly.

**Tech Stack:** Electron IPC, Drizzle/SQLite, React, TanStack Store, Vitest.

---

### Task 1: Create a stable SQLite page query

**Files:**

- Create: `apps/desktop/src/main/ipc/queries/saves-page.ts`
- Create: `apps/desktop/src/main/ipc/queries/saves-page.test.ts`
- Modify: `apps/desktop/src/main/ipc/queries/saves.ts:1-130`

- [ ] **Step 1: Write the failing cursor test**

```ts
import { describe, expect, it } from "vitest";
import { pageAfter } from "./saves-page";

describe("pageAfter", () => {
  it("uses id as a stable timestamp tie-breaker", () => {
    const cursor = { savedAt: 100, id: "m" };
    expect(pageAfter({ savedAt: 101, id: "z" }, cursor)).toBe(false);
    expect(pageAfter({ savedAt: 100, id: "a" }, cursor)).toBe(true);
    expect(pageAfter({ savedAt: 99, id: "z" }, cursor)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @pond/desktop test -- saves-page.test.ts`

Expected: FAIL because `./saves-page` does not exist.

- [ ] **Step 3: Add the cursor helper**

```ts
export interface SavePageCursor { savedAt: number; id: string }

export function pageAfter(row: SavePageCursor, cursor: SavePageCursor): boolean {
  return row.savedAt < cursor.savedAt ||
    (row.savedAt === cursor.savedAt && row.id < cursor.id);
}

export function cursorFor(rows: readonly SavePageCursor[]): SavePageCursor | null {
  const row = rows.at(-1);
  return row ? { savedAt: row.savedAt, id: row.id } : null;
}
```

- [ ] **Step 4: Add the `saves.listPage` handler**

Import `count`, `lt`, and `or` from `drizzle-orm`, then add the handler beside the untouched `saves.list` handler. Limit it to 250 rows and fetch one additional row to calculate `nextCursor`.

```ts
async "saves.listPage"(params) {
  const limit = Math.min(Math.max(1, Number(params.limit) || 250), 500);
  const raw = params.cursor as Partial<SavePageCursor> | undefined;
  const cursor = raw && Number.isFinite(raw.savedAt) && raw.id
    ? { savedAt: Number(raw.savedAt), id: String(raw.id) } : null;
  const after = cursor ? or(
    lt(saves.savedAt, cursor.savedAt),
    and(eq(saves.savedAt, cursor.savedAt), lt(saves.id, cursor.id)),
  ) : undefined;
  const db = await getDb();
  const rows = await db.select(SAVE_LIST_COLUMNS).from(saves).where(after)
    .orderBy(desc(saves.savedAt), desc(saves.id)).limit(limit + 1);
  const pageRows = rows.slice(0, limit);
  const grouped = await loadTasksFor(db, pageRows.map((row) => row.id));
  const [{ value: total }] = await db.select({ value: count() }).from(saves);
  return {
    rows: toWireSaves(pageRows.map(({ rawSlim, ...row }) => ({ ...row, rawJson: rawSlim }) as Save), grouped),
    nextCursor: rows.length > limit ? cursorFor(pageRows) : null,
    total: Number(total),
  };
},
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @pond/desktop test -- saves-page.test.ts && pnpm --filter @pond/desktop exec tsc --noEmit -p tsconfig.web.json`

Expected: PASS.

Run: `git add apps/desktop/src/main/ipc/queries/saves-page.ts apps/desktop/src/main/ipc/queries/saves-page.test.ts apps/desktop/src/main/ipc/queries/saves.ts && git commit -m "feat(desktop): add cursor-paged save listing"`

### Task 2: Make the renderer pool page-aware

**Files:**

- Modify: `apps/desktop/src/renderer/src/stores/bootstrap.ts:8-108`
- Modify: `apps/desktop/src/renderer/src/lib/save/snapshot.ts:1-84`
- Modify: `apps/desktop/src/renderer/src/hooks/use-saves.ts:1-45`
- Create: `apps/desktop/src/renderer/src/stores/bootstrap.test.ts`

- [ ] **Step 1: Write the failing initial-page test**

```ts
it("stops after the first page until another page is requested", async () => {
  window.pond.query = vi.fn().mockResolvedValue({
    rows: [{ id: "new", savedAt: 20 }],
    nextCursor: { savedAt: 20, id: "new" },
    total: 2,
  });
  await bootPool();
  expect(window.pond.query).toHaveBeenCalledWith("saves.listPage", { limit: 250 });
  expect(pagingStore.state).toMatchObject({ ready: true, loaded: 1, total: 2, hasMore: true });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @pond/desktop test -- bootstrap.test.ts`

Expected: FAIL because `pagingStore` does not exist.

- [ ] **Step 3: Implement page state and loading**

```ts
interface PagingState {
  ready: boolean; loading: boolean; loaded: number; total: number;
  nextCursor: SavePageCursor | null; hasMore: boolean;
}

export const pagingStore = new Store<PagingState>({
  ready: false, loading: false, loaded: 0, total: 0, nextCursor: null, hasMore: true,
});

const PAGE_SIZE = 250;
let pageInflight: Promise<void> | null = null;

export function loadNextPage(): Promise<void> {
  if (pageInflight) return pageInflight;
  if (!pagingStore.state.hasMore) return Promise.resolve();
  pageInflight = fetchPage(pagingStore.state.nextCursor)
    .finally(() => { pageInflight = null; });
  return pageInflight;
}
```

`fetchPage` sets `loading`, calls `saves.listPage` with `{ limit: PAGE_SIZE }` plus `cursor` after the first request, normalises the rows, calls `bulkUpsertSaves`, and updates `loaded`, `total`, `nextCursor`, and `hasMore`. In `bootPool`, call `primeSnapshot()`, await `loadNextPage()`, then mark `ready`. Delete `hydrateRemainder` and its unconditional `saves.list` request.

- [ ] **Step 4: Cap the warm snapshot**

```ts
const SNAPSHOT_LIMIT = 250;

export const scheduleSnapshotWrite = debounce(
  () => void writeSnapshot(pool.snapshot().slice(0, SNAPSHOT_LIMIT)),
  { wait: WRITE_DEBOUNCE_MS },
);
```

Slice an old `readSnapshot()` result to 250 before normalising it in `primeSnapshot`.

- [ ] **Step 5: Expose page state**

```ts
export function useSavePaging() {
  return useSelector(pagingStore, (s) => ({
    hasMore: s.hasMore, loading: s.loading, loaded: s.loaded, total: s.total,
  }));
}
```

Make `useBootReady` select `pagingStore.state.ready`.

- [ ] **Step 6: Verify and commit**

Run: `pnpm --filter @pond/desktop test -- bootstrap.test.ts && pnpm --filter @pond/desktop exec tsc --noEmit -p tsconfig.web.json`

Expected: PASS.

Run: `git add apps/desktop/src/renderer/src/stores/bootstrap.ts apps/desktop/src/renderer/src/stores/bootstrap.test.ts apps/desktop/src/renderer/src/lib/save/snapshot.ts apps/desktop/src/renderer/src/hooks/use-saves.ts && git commit -m "feat(desktop): hydrate library saves by page"`

### Task 3: Load another page at the end of the packed grid

**Files:**

- Modify: `apps/desktop/src/renderer/src/components/library/layouts/packed-grid/index.tsx:36-104`
- Modify: `apps/desktop/src/renderer/src/components/library/layouts/grid-view/index.tsx:15-45`
- Modify: `apps/desktop/src/renderer/src/components/library/layouts/justified/index.tsx:65-99`
- Modify: `apps/desktop/src/renderer/src/components/library/layouts/waterfall/index.tsx:46-76`
- Modify: `apps/desktop/src/renderer/src/components/shared/layout-switcher/index.tsx:8-49`
- Modify: `apps/desktop/src/renderer/src/routes/_library/-library-view.tsx:12-55`
- Modify: `apps/desktop/src/renderer/src/hooks/use-library-state.ts:1-70`
- Create: `apps/desktop/src/renderer/src/components/library/layouts/packed-grid/index.test.tsx`

- [ ] **Step 1: Write the failing near-end test**

```tsx
it("requests another page when the final eight packed items become visible", () => {
  const onEndReached = vi.fn();
  render(<PackedGrid layout="grid" totalHeight={1200} onEndReached={onEndReached}
    items={Array.from({ length: 8 }, (_, i) => ({ id: String(i), top: i * 100, left: 0, width: 100, height: 100 }))}
    renderItem={() => null} />);
  expect(onEndReached).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @pond/desktop test -- packed-grid/index.test.tsx`

Expected: FAIL because `onEndReached` is not a prop.

- [ ] **Step 3: Thread the callback through every layout**

Add `onEndReached?: () => void` to `PackedGrid`, `SavePackedGrid`, `GridView`, `JustifiedView`, `WaterfallView`, and `LayoutSwitcher`. In `PackedGrid`, import `useEffect` and call the callback from its existing windowed range:

```ts
const END_THRESHOLD_ITEMS = 8;

useEffect(() => {
  if ((visible.at(-1) ?? -1) >= items.length - END_THRESHOLD_ITEMS) {
    onEndReached?.();
  }
}, [visible, items.length, onEndReached]);
```

- [ ] **Step 4: Connect paging only to the ordinary library**

In `-library-view.tsx`, import `loadNextPage` and `useSavePaging`. Add explicit `hasActiveSearch`, `hasActiveFilter`, and `askActive` flags to `LibraryState` using the existing search, view-filter, and ask stores. Pass `onEndReached={() => void loadNextPage()}` only while mode is `library`, those flags are all false, and `paging.hasMore && !paging.loading`. This prevents a partial default page from claiming to be an exact filtered result.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @pond/desktop test -- packed-grid/index.test.tsx && pnpm --filter @pond/desktop build && git diff --check`

Expected: PASS; existing dynamic-import warnings are acceptable.

Run: `git add apps/desktop/src/renderer/src/components/library/layouts apps/desktop/src/renderer/src/components/shared/layout-switcher/index.tsx apps/desktop/src/renderer/src/routes/_library/-library-view.tsx apps/desktop/src/renderer/src/hooks/use-library-state.ts && git commit -m "feat(desktop): load library pages on scroll"`

### Task 4: Protect cold search and final verification

**Files:**

- Modify: `apps/desktop/src/renderer/src/stores/bootstrap.test.ts`
- Test: `apps/desktop/src/renderer/src/lib/save/ensure-saves.ts`

- [ ] **Step 1: Add the searched-cold-save regression**

```ts
it("hydrates a searched cold save with getMany without loading a library page", async () => {
  await bootPool();
  await ensureSaves(["cold-save"]);
  expect(window.pond.query).toHaveBeenCalledWith("saves.getMany", { ids: ["cold-save"] });
  expect(window.pond.query).not.toHaveBeenCalledWith(
    "saves.listPage", expect.objectContaining({ cursor: expect.anything() }),
  );
});
```

- [ ] **Step 2: Run the final checks and commit**

Run: `pnpm --filter @pond/desktop test -- saves-page.test.ts bootstrap.test.ts packed-grid/index.test.tsx && pnpm --filter @pond/desktop exec tsc --noEmit -p tsconfig.web.json && pnpm --filter @pond/desktop build && git diff --check`

Expected: PASS. Report the existing repository-wide `Stampable` type failure separately if it remains.

Run: `git add apps/desktop/src/renderer/src/stores/bootstrap.test.ts && git commit -m "test(desktop): cover cold saves with paged loading"`

## Self-review

- **Spec coverage:** Tasks 1–3 create cursor pages, remove full hydration, and fetch pages on scroll; Task 4 preserves direct cold-save hydration.
- **Placeholder scan:** Every task specifies paths, code, assertions, commands, and expected outcomes.
- **Type consistency:** `SavePageCursor`, `saves.listPage`, `pagingStore`, `loadNextPage`, and `onEndReached` are used consistently.
