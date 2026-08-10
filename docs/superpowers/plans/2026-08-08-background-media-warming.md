# Background Media Warming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a resumable, Apple-style media preparation sweep that scans the library, repairs missing video posters, and prepares aspect-ratio-preserving previews while Pond is idle, leaving viewport lazy loading responsible only for displaying those prepared files.

**Architecture:** Treat indexing/preparation and display as separate layers. A main-process, single-job background sweep scans durable save metadata and content-addressed cache state, repairs one missing video poster at a time, then prepares responsive preview variants without cropping or changing aspect ratio; the renderer continues to lazy-load only cards near the viewport. Foreground `pond://` requests always win, completed artifacts make the sweep naturally resumable across launches, and power/thermal/interaction gates make the work opportunistic.

**Tech Stack:** Electron main process, TypeScript, Drizzle/SQLite, Sharp, bundled FFmpeg, Vitest

---

## File map

- Create `apps/desktop/src/main/core/media-warm/policy.ts`: pure eligibility policy for idle, battery, thermal, and foreground-busy signals.
- Create `apps/desktop/src/main/core/media-warm/candidates.ts`: derive poster-repair and thumbnail candidates from indexed saves.
- Create `apps/desktop/src/main/core/media-warm/service.ts`: lifecycle, scheduling, power-monitor listeners, cancellation, serial work loop, and progress logging.
- Create matching `*.test.ts` files beside each module.
- Modify `apps/desktop/src/main/lib/thumbnail.ts`: define shared aspect-preserving preview profiles, accept a background priority, and prevent speculative work from occupying foreground capacity.
- Modify `apps/desktop/src/main/core/pipeline/workers/ensure-poster.ts`: deduplicate simultaneous poster generation for a save.
- Modify `apps/desktop/src/main/index.ts`: start the warmer after library reconciliation and stop it during quit.
- Modify `apps/desktop/src/shared/constants.ts` and `apps/desktop/src/preload/index.ts`: expose typed media-index status, start, pause, and resume IPC.
- Create `apps/desktop/src/renderer/src/components/shell/toolbar/media-index.tsx`: toolbar status button and popover controls.
- Modify `apps/desktop/src/renderer/src/components/shell/toolbar/index.tsx`: place the media-index control immediately before Settings.

### Task 1: Make thumbnail generation foreground-aware

**Files:**
- Modify: `apps/desktop/src/main/lib/thumbnail.ts`
- Create: `apps/desktop/src/main/lib/thumbnail.test.ts`

- [ ] **Step 1: Write failing tests for priority and cache behavior**

Add tests around an exported test-only scheduler factory so they do not invoke Sharp:

```ts
import { describe, expect, it, vi } from "vitest";
import { createThumbnailScheduler } from "./thumbnail";

describe("thumbnail scheduler", () => {
  it("runs a waiting foreground job before a waiting background job", async () => {
    const scheduler = createThumbnailScheduler(1);
    const release = Promise.withResolvers<void>();
    const order: string[] = [];
    const first = scheduler.run("background", async () => {
      order.push("active-background");
      await release.promise;
    });
    const second = scheduler.run("background", async () => order.push("queued-background"));
    const foreground = scheduler.run("foreground", async () => order.push("foreground"));
    release.resolve();
    await Promise.all([first, second, foreground]);
    expect(order).toEqual(["active-background", "foreground", "queued-background"]);
  });

  it("allows at most one background transform at once", async () => {
    const scheduler = createThumbnailScheduler(4);
    let activeBackground = 0;
    let peakBackground = 0;
    const job = () => scheduler.run("background", async () => {
      activeBackground += 1;
      peakBackground = Math.max(peakBackground, activeBackground);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeBackground -= 1;
    });
    await Promise.all([job(), job(), job()]);
    expect(peakBackground).toBe(1);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm --filter @pond/desktop test -- src/main/lib/thumbnail.test.ts`

Expected: FAIL because `createThumbnailScheduler` is not exported.

- [ ] **Step 3: Replace the FIFO semaphore with a priority scheduler**

Add these public types and change `getOrCreateThumbnail` to accept an optional priority:

```ts
export type ThumbnailPriority = "foreground" | "background";

interface ThumbnailRequest {
  saveId: string;
  sourcePath: string;
  /** Maximum output width; height remains proportional to the source. */
  width: number;
  version: string | null;
  priority?: ThumbnailPriority;
}

export function createThumbnailScheduler(maxConcurrent: number) {
  let active = 0;
  let backgroundActive = 0;
  const foreground: Array<() => void> = [];
  const background: Array<() => void> = [];

  function drain(): void {
    while (active < maxConcurrent) {
      const next = foreground.shift() ?? (backgroundActive === 0 ? background.shift() : undefined);
      if (!next) return;
      next();
    }
  }

  async function run<T>(priority: ThumbnailPriority, task: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      const start = () => {
        active += 1;
        if (priority === "background") backgroundActive += 1;
        resolve();
      };
      (priority === "foreground" ? foreground : background).push(start);
      drain();
    });
    try {
      return await task();
    } finally {
      active -= 1;
      if (priority === "background") backgroundActive -= 1;
      drain();
    }
  }

  return { run };
}
```

Create one module scheduler with `MAX_CONCURRENT`, wrap the existing Sharp body in `scheduler.run(req.priority ?? "foreground", ...)`, and keep cache-hit/in-flight deduplication ahead of scheduler acquisition.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @pond/desktop test -- src/main/lib/thumbnail.test.ts && pnpm --filter @pond/desktop exec tsc --noEmit -p tsconfig.node.json`

Expected: PASS with no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/lib/thumbnail.ts apps/desktop/src/main/lib/thumbnail.test.ts
git commit -m "perf(desktop): prioritize visible thumbnail work"
```

### Task 2: Define background eligibility and candidates

**Files:**
- Create: `apps/desktop/src/main/core/media-warm/policy.ts`
- Create: `apps/desktop/src/main/core/media-warm/policy.test.ts`
- Create: `apps/desktop/src/main/core/media-warm/candidates.ts`
- Create: `apps/desktop/src/main/core/media-warm/candidates.test.ts`

- [ ] **Step 1: Write failing policy tests**

```ts
import { describe, expect, it } from "vitest";
import { canWarmMedia } from "./policy";

const ready = { idleSeconds: 20, onBattery: false, thermal: "nominal" as const, foregroundBusy: false };

describe("canWarmMedia", () => {
  it("warms only after ten idle seconds", () => {
    expect(canWarmMedia(ready)).toBe(true);
    expect(canWarmMedia({ ...ready, idleSeconds: 9 })).toBe(false);
  });
  it("pauses on battery, thermal pressure, or foreground work", () => {
    expect(canWarmMedia({ ...ready, onBattery: true })).toBe(false);
    expect(canWarmMedia({ ...ready, thermal: "serious" })).toBe(false);
    expect(canWarmMedia({ ...ready, foregroundBusy: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Write failing candidate tests**

Use small `Save` fixtures to assert:

```ts
expect(mediaWarmCandidate(videoWithoutPoster)).toEqual({ kind: "poster", saveId: "v1" });
expect(mediaWarmCandidate(videoWithPoster)).toMatchObject({ kind: "thumbnail", saveId: "v2", file: "poster.jpg" });
expect(mediaWarmCandidate(imageSave)).toMatchObject({ kind: "thumbnail", saveId: "i1", file: "image.png" });
expect(mediaWarmCandidate(textOnlySave)).toBeNull();
```

Also assert that animated/vector formats are skipped and that only `ready`/`partial` saves are candidates.

- [ ] **Step 3: Run both tests and confirm they fail**

Run: `pnpm --filter @pond/desktop test -- src/main/core/media-warm/policy.test.ts src/main/core/media-warm/candidates.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement the pure policy**

```ts
export type ThermalState = "unknown" | "nominal" | "fair" | "serious" | "critical";

export interface MediaWarmSignals {
  idleSeconds: number;
  onBattery: boolean;
  thermal: ThermalState;
  foregroundBusy: boolean;
}

export function canWarmMedia(signals: MediaWarmSignals): boolean {
  return signals.idleSeconds >= 10 &&
    !signals.onBattery &&
    !signals.foregroundBusy &&
    signals.thermal !== "serious" &&
    signals.thermal !== "critical";
}
```

- [ ] **Step 5: Implement deterministic candidate selection**

Export a `MediaWarmCandidate` union containing either `{ kind: "poster"; saveId }` or `{ kind: "thumbnail"; saveId; sourcePath; profile; version }`. Use the same cover rules as `buildMediaUnits`: a video without `poster`/`cover` needs repair; otherwise prefer `poster`, then `cover`, then the first still raster. Resolve paths with `itemDir(save.id)` and use the file's first 12 SHA-256 characters as `version`. The shared `card` profile currently has a 768px **maximum width**, but it must be named/versioned rather than embedded in candidate selection: `resize({ width: 768, fit: "inside", withoutEnlargement: true })` yields 768×432 for 16:9 and 768×1365 for 9:16, with no square crop or distortion.

- [ ] **Step 6: Run focused tests**

Run: `pnpm --filter @pond/desktop test -- src/main/core/media-warm/policy.test.ts src/main/core/media-warm/candidates.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/main/core/media-warm
git commit -m "feat(desktop): define idle media warming policy"
```

### Task 3: Build the cancellable warmer service

**Files:**
- Create: `apps/desktop/src/main/core/media-warm/service.ts`
- Create: `apps/desktop/src/main/core/media-warm/service.test.ts`
- Modify: `apps/desktop/src/main/core/pipeline/workers/ensure-poster.ts`
- Modify: `apps/desktop/src/main/core/pipeline/workers/ensure-poster.test.ts`

- [ ] **Step 1: Write failing service tests with injected dependencies**

Construct the service with injected `listSaves`, `signals`, `repairPoster`, `warmThumbnail`, and timer functions. Verify that it:

```ts
it("does no work until policy permits it");
it("processes exactly one candidate at a time");
it("checks power and idle signals between candidates");
it("repairs a poster before thumbnailing that save on the next pass");
it("continues after one candidate fails");
it("stops scheduling after stop() is called");
```

The serial-work assertion must hold a deferred first promise, advance timers, and verify the second dependency has not been called until the first resolves.

- [ ] **Step 2: Add a failing poster deduplication test**

Mock `extractFirstFrame`, call `runEnsurePoster("same-id")` twice concurrently, and assert `extractFirstFrame` is invoked once. This protects the startup backfill from racing a live ingest task.

- [ ] **Step 3: Run the focused tests and confirm they fail**

Run: `pnpm --filter @pond/desktop test -- src/main/core/media-warm/service.test.ts src/main/core/pipeline/workers/ensure-poster.test.ts`

Expected: FAIL because the service and poster in-flight deduplication do not exist.

- [ ] **Step 4: Deduplicate poster generation**

Keep the current implementation as an internal function and wrap it:

```ts
const posterInflight = new Map<string, Promise<void>>();

export function runEnsurePoster(saveId: string): Promise<void> {
  const existing = posterInflight.get(saveId);
  if (existing) return existing;
  const task = ensurePoster(saveId).finally(() => posterInflight.delete(saveId));
  posterInflight.set(saveId, task);
  return task;
}
```

- [ ] **Step 5: Implement the service loop**

The production adapter must query saves in newest-first pages rather than loading the whole library, call `mediaWarmCandidate`, and process only one item per tick. For preview candidates resolve the named profile and call:

```ts
await getOrCreateThumbnail({
  saveId: candidate.saveId,
  sourcePath: candidate.sourcePath,
  width: PREVIEW_PROFILES[candidate.profile].maxWidth,
  version: candidate.version,
  priority: "background",
});
```

Use a 1-second policy poll while paused and `setImmediate` between completed candidates. Read `powerMonitor.getSystemIdleTime()`, `powerMonitor.isOnBatteryPower()`, and the last `thermal-state-change` value. Subscribe to `on-ac`, `on-battery`, `resume`, and `thermal-state-change` to kick a fresh eligibility check. Log one start summary, completion totals, and individual failures at warning level; do not log every cache hit.

- [ ] **Step 6: Run service, poster, and thumbnail tests**

Run: `pnpm --filter @pond/desktop test -- src/main/core/media-warm/service.test.ts src/main/core/pipeline/workers/ensure-poster.test.ts src/main/lib/thumbnail.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/main/core/media-warm apps/desktop/src/main/core/pipeline/workers/ensure-poster.ts apps/desktop/src/main/core/pipeline/workers/ensure-poster.test.ts
git commit -m "feat(desktop): warm media previews while idle"
```

### Task 4: Wire lifecycle and verify the user-visible result

**Files:**
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/index.test.ts` if an application bootstrap harness exists; otherwise extend `service.test.ts` with lifecycle coverage.

- [ ] **Step 1: Add a failing lifecycle test**

Verify startup occurs only after `reconcileLibrary()` resolves and shutdown calls `stopMediaWarmer()` before database/process teardown. Keep Electron objects mocked; this test must not launch a real app.

- [ ] **Step 2: Run the lifecycle test and confirm it fails**

Run: `pnpm --filter @pond/desktop test -- src/main/core/media-warm/service.test.ts`

Expected: FAIL because lifecycle calls are absent.

- [ ] **Step 3: Start and stop warming from the main process**

In `postLaunchInit`, change the reconciliation chain so successful or failed reconciliation both lead to `startMediaWarmer()` only after the initial scan settles. In `before-quit`, call `stopMediaWarmer()` synchronously before awaiting server and database shutdown. Starting hidden at login must use this identical path; do not create a separate macOS helper in this version.

- [ ] **Step 4: Run the main-process verification suite**

Run: `pnpm --filter @pond/desktop test -- src/main && pnpm --filter @pond/desktop exec tsc --noEmit -p tsconfig.node.json && git diff --check`

Expected: main-process tests pass, TypeScript reports no errors, and `git diff --check` is silent.

- [ ] **Step 5: Perform a manual cold-cache check**

In Developer settings, clear `_thumbs`, restart Pond, leave it idle on AC power for at least ten seconds, then open a section containing older YouTube videos. Confirm:

- visible cards still load first if the library is opened immediately;
- CPU activity remains serial/low after the foreground settles;
- generated poster WebPs appear under `_thumbs/` before their cards enter the viewport;
- closing the window to the tray allows warming to continue;
- switching to battery power pauses new background jobs after the current one;
- returning to AC resumes without regenerating cache hits.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/main/index.ts apps/desktop/src/main/core/media-warm
git commit -m "feat(desktop): start media warming after library scan"
```

### Task 5: Add the media-index control to the chrome toolbar

**Files:**
- Modify: `apps/desktop/src/shared/constants.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/main/ipc/queries/index.ts`
- Create: `apps/desktop/src/main/ipc/queries/media-index.ts`
- Create: `apps/desktop/src/renderer/src/hooks/use-media-index.ts`
- Create: `apps/desktop/src/renderer/src/components/shell/toolbar/media-index.tsx`
- Create: `apps/desktop/src/renderer/src/components/shell/toolbar/media-index.test.tsx`
- Create: `apps/desktop/src/renderer/src/components/shell/toolbar/media-index.module.css`
- Modify: `apps/desktop/src/renderer/src/components/shell/toolbar/index.tsx`
- Modify: `apps/desktop/src/renderer/src/components/shell/toolbar/lib.ts`

- [ ] **Step 1: Write failing component tests for every user-visible state**

Mock the hook and verify the toolbar control uses `IconImageSparkleFill18`, has the accessible name `Media index`, and appears immediately before Settings. Test the popover states:

```ts
it("offers Index now when the sweep is idle and incomplete");
it("shows prepared and remaining counts while indexing");
it("offers Pause while a sweep is running");
it("offers Resume when the user paused the sweep");
it("explains automatic power or idle pauses without calling them errors");
it("shows All media prepared and Check again when complete");
it("shows the last failure and Retry after an error");
it("disables controls while a start, pause, or resume mutation is pending");
```

The manual `Index now` action starts immediately instead of waiting for system idle, but it must still respect critical thermal pressure and storage-safety guards.

- [ ] **Step 2: Run the component test and confirm it fails**

Run: `pnpm --filter @pond/desktop test -- src/renderer/src/components/shell/toolbar/media-index.test.tsx`

Expected: FAIL because the component and hook do not exist.

- [ ] **Step 3: Define typed status and IPC operations**

Expose this shared status shape through a query plus a push subscription:

```ts
export type MediaIndexState =
  | "idle"
  | "indexing"
  | "paused-user"
  | "paused-system"
  | "complete"
  | "error";

export interface MediaIndexStatus {
  state: MediaIndexState;
  prepared: number;
  remaining: number;
  currentTitle: string | null;
  pauseReason: "battery" | "active" | "thermal" | null;
  lastError: string | null;
}
```

Add `mediaIndex.status`, `mediaIndex.start`, `mediaIndex.pause`, and `mediaIndex.resume` queries. `start` performs a fresh candidate scan before running, `pause` is sticky until explicit resume or app restart, and all mutations return the resulting status. Broadcast status only when a field changes, and remove renderer listeners through the preload unsubscribe function.

- [ ] **Step 4: Implement the renderer hook**

Use TanStack Query for the initial status, subscribe once for push updates, and update the same query cache entry. Return `start`, `pause`, and `resume` mutations with a shared `pending` boolean; do not poll while push events are connected.

- [ ] **Step 5: Build the toolbar panel using existing primitives**

Use `StatusPanel`, `Empty`, and `Row` rather than introducing another popover style. The trigger is the same ghost `sm` icon button as its siblings and is inserted after `OngoingPanel`, immediately before Settings:

```tsx
<MediaIndexPanel open={open === "media-index"} onOpenChange={setOpen} />
<Button aria-label="Settings" /* existing props */>
  <IconGear3Fill18 />
</Button>
```

Use `IconImageSparkleFill18` in the resting state. While indexing, retain the icon and add the same restrained rotating status treatment used by `ProgressPanel`; do not add a second spinner or animate layout. The popover copy is precise:

- Idle: `Prepare previews so your library opens faster.` / `Index now`
- Running: `Preparing media` / `{prepared} prepared · {remaining} remaining` / `Pause`
- User-paused: `Indexing paused` / `Resume`
- System-paused: `Waiting for power`, `Waiting until your Mac is idle`, or `Waiting for your Mac to cool down`
- Complete: `All media prepared` / `Check again`
- Error: `Indexing stopped` / sanitized failure summary / `Retry`

Set `aria-live="polite"` on the textual status, expose progress with `<progress max={prepared + remaining} value={prepared}>`, preserve the existing visible focus ring, and remove rotation under `prefers-reduced-motion: reduce`.

- [ ] **Step 6: Run component and IPC tests**

Run: `pnpm --filter @pond/desktop test -- src/renderer/src/components/shell/toolbar/media-index.test.tsx src/main/ipc/queries/media-index.test.ts`

Expected: PASS.

- [ ] **Step 7: Run the complete desktop verification suite**

Run: `pnpm --filter @pond/desktop test && pnpm --filter @pond/desktop exec tsc --noEmit -p tsconfig.node.json && pnpm --filter @pond/desktop exec tsc --noEmit -p tsconfig.web.json && pnpm --filter @pond/desktop build && git diff --check`

Expected: all tests pass, both TypeScript projects report no errors, the production build succeeds, and `git diff --check` is silent.

- [ ] **Step 8: Manually verify toolbar behavior**

Confirm with light and dark themes, keyboard-only navigation, reduced motion, a narrow window with several tabs, and each mocked status. The button must remain in the fixed action cluster, the popover must align to the toolbar edge without clipping, and indexing state must remain understandable without relying on icon motion or color.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/shared/constants.ts apps/desktop/src/preload/index.ts apps/desktop/src/main/ipc/queries apps/desktop/src/renderer/src/hooks/use-media-index.ts apps/desktop/src/renderer/src/components/shell/toolbar
git commit -m "feat(desktop): add media index toolbar control"
```

## Explicitly deferred

- Continuing after Pond fully quits: Electron cannot rely on macOS background execution; launch-at-login plus close-to-tray covers the intended experience without a privileged helper.
- A persistent preference for automatic indexing: the toolbar provides start/pause/resume and progress, while automatic opportunistic behavior remains the default.
- Additional responsive preview profiles: v1 prepares only the existing `card` profile. The profile is named and versioned so a smaller list preview or larger display-density variant can be added without coupling the indexer to a layout component.
- Durable queue rows: content-addressed cache hits make rescanning cheap, and avoiding a second queue prevents migration and recovery complexity.
