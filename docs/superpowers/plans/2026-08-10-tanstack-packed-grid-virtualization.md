# TanStack Packed Grid Virtualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Pond's custom packed-grid viewport scanner with TanStack Virtual while preserving the existing card layout and styling exactly.

**Architecture:** Keep the existing grid, justified, and waterfall packers as the single source of item geometry. Divide their already-positioned vertical surface into fixed-size virtual bands; TanStack Virtual owns viewport range calculation and scroll offset restoration, while a pure band index maps each virtual band back to the packed cards that intersect it. This avoids changing masonry placement or card markup and makes all three layouts share one tested virtualization path.

**Tech Stack:** React 19, TypeScript, `@tanstack/react-virtual`, Vitest, Electron renderer

---

### Task 1: Add the virtual band index

**Files:**
- Create: `apps/desktop/src/renderer/src/components/library/layouts/packed-grid/virtual-bands.ts`
- Create: `apps/desktop/src/renderer/src/components/library/layouts/packed-grid/virtual-bands.test.ts`

- [ ] **Step 1: Write failing tests for band membership and deduplication**

Cover items that fit within one band, cross a band boundary, and appear in multiple visible bands. Assert that the final visible indices remain in source order and contain no duplicates.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm --filter @pond/desktop test -- virtual-bands.test.ts`

Expected: FAIL because `virtual-bands.ts` does not exist.

- [ ] **Step 3: Implement the pure band index**

Export a fixed `PACKED_GRID_BAND_PX`, a function that buckets each `PackedItem` into every intersected band, and a function that flattens selected bands into unique source indices. Clamp all band indexes to the valid surface and treat zero-height surfaces as empty.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `pnpm --filter @pond/desktop test -- virtual-bands.test.ts`

Expected: PASS.

### Task 2: Replace custom viewport scanning with TanStack Virtual

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/desktop/src/renderer/src/components/library/layouts/packed-grid/index.tsx`
- Modify: `apps/desktop/src/renderer/src/components/library/layouts/packed-grid/index.test.tsx`

- [ ] **Step 1: Add the React virtualizer dependency**

Run: `pnpm --filter @pond/desktop add @tanstack/react-virtual@^3.14.9`

Expected: the desktop package gains a direct dependency and the lockfile resolves the React adapter.

- [ ] **Step 2: Update the PackedGrid test around a real scroll element**

Render the grid inside a fixed-height overflow container, provide deterministic element measurements, and retain the `onEndReached` assertion. Add an assertion that a large collection mounts only a bounded subset of cards.

- [ ] **Step 3: Integrate `useVirtualizer`**

Use fixed-size virtual bands with a modest overscan. Resolve the existing `Shell.Main` scroll ancestor, supply the grid's scroll margin, and map `virtualizer.getVirtualItems()` through the pure band index. Continue passing the original packed geometry into `SaveCard`; do not edit CSS, card markup, gaps, widths, heights, or layout packers.

- [ ] **Step 4: Verify focused component tests**

Run: `pnpm --filter @pond/desktop test -- packed-grid/index.test.tsx virtual-bands.test.ts`

Expected: PASS with bounded mounting and end-of-list pagination intact.

### Task 3: Let the virtualizer own packed-grid restoration

**Files:**
- Modify: `apps/desktop/src/renderer/src/hooks/use-scroll-restoration.ts`
- Modify: `apps/desktop/src/renderer/src/hooks/use-scroll-restoration.test.ts`
- Modify: `apps/desktop/src/renderer/src/components/library/page/index.tsx`
- Modify: `apps/desktop/src/renderer/src/components/library/layouts/packed-grid/index.tsx`

- [ ] **Step 1: Test the restoration state contract**

Keep the per-tab/per-route offset tests and add coverage for binding a packed grid to the active restoration key without resetting a previously remembered offset.

- [ ] **Step 2: Expose restoration state to the packed grid**

Provide the active key and scroll-element ref through a small React context owned by the library page. Keep a manual fallback for routes without a packed grid.

- [ ] **Step 3: Configure virtualizer restoration**

Pass `initialOffset: () => recallScroll(key)` to the virtualizer and persist its scroll offset from `onChange`. Ensure the fallback listener does not overwrite the target while the virtualizer is binding, and use persistent item/band keys.

- [ ] **Step 4: Verify restoration and grid tests**

Run: `pnpm --filter @pond/desktop test -- use-scroll-restoration.test.ts packed-grid/index.test.tsx virtual-bands.test.ts`

Expected: PASS.

### Task 4: Regression verification

**Files:**
- Verify only; no styling files should change.

- [ ] **Step 1: Confirm the no-style-change constraint**

Run: `git diff --name-only -- '*.css' '*.module.css'`

Expected: no new CSS changes attributable to this migration.

- [ ] **Step 2: Run renderer type checking**

Run: `pnpm --filter @pond/desktop exec tsc --noEmit -p tsconfig.web.json`

Expected: PASS.

- [ ] **Step 3: Run the desktop test suite**

Run: `pnpm --filter @pond/desktop test`

Expected: PASS.

- [ ] **Step 4: Build the desktop application**

Run: `pnpm --filter @pond/desktop build`

Expected: PASS, aside from known non-fatal bundle warnings.

- [ ] **Step 5: Check patch hygiene**

Run: `git diff --check`

Expected: no whitespace errors.
