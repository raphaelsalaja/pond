# Desktop performance measurements

## Safety and scope

Use synthetic Saves only. Never open a personal Library or copy its data, queries,
paths, or credentials into reports. Long-running development processes belong to
the runtime owner: do not start a server, stop one, or rebuild native dependencies
under a running app. Obtain explicit permission before any restart or temporary
Library switch. Coordinate a quiet measurement window rather than stopping
competing processes yourself.

The local baseline and pending approvals are in
[performance-baseline.md](../../plans/performance-baseline.md).
Bundle byte budgets remain in `scripts/check-performance-budgets.mjs`; these
benchmarks neither replace them nor introduce CI latency thresholds.

## Repeatable offline microbenchmarks

From the repository root:

```sh
pnpm --filter @pond/desktop exec vitest run src/main/core/library-performance-benchmark.test.ts src/renderer/src/features/saves/lib/bulk-performance-benchmark.test.ts

POND_BENCH_LIBRARY=1 ELECTRON_RUN_AS_NODE=1 pnpm --filter @pond/desktop exec electron node_modules/vitest/vitest.mjs run src/main/core/library-performance-benchmark.test.ts src/renderer/src/features/saves/lib/bulk-performance-benchmark.test.ts
```

Ordinary invocation skips all 39 opt-in tests. Enabled invocation must execute
both files; native ABI failure is a STOP, not permission to rebuild dependencies.
Run twice, retaining both sets of JSON records. Record commit and working-tree
changes, hardware, versions, date, background activity, power/thermal state when
known, and exact command. Do not run checks/builds concurrently with measurements.

Fixtures use N=1k/10k/50k. Query measurements use in-memory SQLite and include exact
counts plus a page of up to 250 IDs, without hydration, IPC, or painting. The fixed
generator makes 10% keyword matches, 1% selective folder membership, and 100% broad
folder membership. Measure savedAt/title descending, zero/three pins, first/next
pages. No next page exists when the matching set fits on page one; report those
combinations as not applicable, never as zero latency. Read fixtures stay unchanged
between repetitions; cursor preparation and seeding are outside timed regions.

Pool measurements use real bulk operations with an injected pending bridge
promise. Each repetition clears and repopulates the pool outside the operation
timer. K=1/100/1000 measures rating, trash, purge and rejected-rating rollback.
Fixture creation and reset timings are separate. Store publications are counted
through a real subscription; they are not React render counts. The operation timer
includes optimistic application, immediate bridge settlement, and rollback when
applicable, but no real IPC or persistence. Assertions run after timing.

Every case has five warm-ups and 30 measured repetitions, raw milliseconds and
nearest-rank p50/p95/max. Query cases have a 30s between-repetition deadline and
300s test timeout per dataset (including SQL-plan diagnostics); bulk cases have a
90s deadline and 100s test timeout. Synchronous
work cannot be preempted by a JavaScript timer; the outer finite command timeout
also bounds a run. Record timeout cases rather than extending runs indefinitely.
Default Vitest file parallelism can make the two benchmark workers compete;
retain this fact in comparisons, and coordinate a quiet serialized supplementary
run before adopting strict timing gates.

Process memory snapshots are bytes from `process.memoryUsage()`, not peaks or
retained-memory measurements. GC is not forced. RSS/heap/external allocations in a
test worker do not represent the complete Electron app, GPU, or all native memory.

## Existing-runtime end-to-end capture (approval required)

1. Agree the synthetic Library, hardware, workload, and capture window with the
   runtime owner. Ask separately for permission to switch Libraries or restart.
   Use the existing runtime; do not launch a second app. Restore the prior Library
   only under the same agreed procedure. Production comparison requires a fresh
   build and owner coordination before opening it.
2. Record development versus production build, commit, screen/viewport size,
   loaded Save count versus total N, sort, pins, folders, selected K, processing
   queue activity, and whether DevTools is open. Do not compare development HMR
   overhead directly with production.
3. Capture startup only after an approved restart. Retain existing
   `[pond startup]` milestones (modules-loaded, app-ready, window-created,
   window-shown, renderer-ready). Separately mark first usable Library: visible
   populated results and an input responding. Renderer-ready is not proof of
   usability. Label fresh-process versus warm-process, OS disk cache state
   (unknown unless controlled), and model state. Do not claim in-memory seeding
   measures disk startup or evict OS caches without permission.
4. In DevTools Performance, record a fixed scroll path, filter entry and result
   paint, and bulk edits for each N/K. Retain trace durations, input-to-next-paint,
   long tasks, scripting/layout/paint breakdown, and result correctness. Use
   synthetic content and inspect exports for private metadata before sharing.
5. Correlate with existing `[pond perf] slow query` handler logs (>=100ms) and
   `[pond perf] main thread blocked` logs (100ms probe, >=200ms excess delay).
   These are diagnostic thresholds, not approved budgets. Absence of a log does
   not establish a fast UI; IPC handler timing excludes transport and rendering.
6. For memory, capture DevTools Memory before interaction, after repeated cycles,
   and after a documented idle interval (e.g. 60 seconds). Record whether GC was
   forced and use the same procedure each time. Track main/renderer/GPU process
   memory separately using OS/Electron tools. Heap snapshots alone do not capture
   native/GPU memory; redact or avoid personal content.
7. Semantic measurements must independently time encoder cold start, warm encoder
   execution, and retrieval SQL. Record model/version and query scope. Plan 004
   supplies isolated native SQL fixtures; do not call an encoder or download a
   model as part of these baseline microbenchmarks.

Until real captures are attached, startup, scroll/filter response, bulk-renderer
long tasks, post-idle app memory, and encoder cold/warm execution remain
**not measured**. Isolated native retrieval SQL was measured in the
[vector retrieval decision](../../plans/vector-retrieval-decision.md); that report
also records incomplete benchmark phases and the rejected prototype. Those SQL
measurements are not end-to-end semantic search latency.

## Budgets and approval

Use the measured workload-specific proposals in the baseline report, not generic
web targets. Approve exact workloads, metric, reference run, tolerances, and
hardware before dependent optimizations. Structural publication counts can be
deterministic tests; elapsed-time regression gates need an agreed stable runner.
Record approver, date, approved targets, and trace evidence in the baseline report.
Missing permission or approval leaves plan 001 BLOCKED, not DONE.

After changes run `pnpm check`, `pnpm build`, and the native correctness gate:

```sh
ELECTRON_RUN_AS_NODE=1 pnpm --filter @pond/desktop exec electron node_modules/vitest/vitest.mjs run src/main/db.test.ts src/main/core/vec-index.test.ts
```

Retain previous results when rebaselining for Electron, model, or runtime changes.
