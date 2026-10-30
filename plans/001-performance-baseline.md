# Plan 001: Establish repeatable local performance baselines

> Executor: read this file completely, follow the numbered steps, and run each verification before continuing. This plan is self-contained; no audit-chat context is required.
>
> Drift check: `git diff --stat e88675ff..HEAD -- apps/desktop/src/main/startup-timing.ts apps/desktop/src/main/ipc/queries/index.ts apps/desktop/src/main/core/library-query.ts apps/desktop/src/main/core/library-retrieval.ts apps/desktop/src/renderer/src/features/saves/state/pool.ts apps/desktop/src/renderer/src/features/saves/lib/mutate.ts scripts/check-performance-budgets.mjs`
> Also inspect `git diff -- apps/desktop/src/main/startup-timing.ts apps/desktop/src/main/ipc/queries/index.ts apps/desktop/src/main/core/library-query.ts apps/desktop/src/main/core/library-retrieval.ts apps/desktop/src/renderer/src/features/saves/state/pool.ts apps/desktop/src/renderer/src/features/saves/lib/mutate.ts scripts/check-performance-budgets.mjs` for uncommitted changes. Compare changed files with the current-state excerpts; STOP on unexplained differences.

## Status

- Priority: P1
- Effort: M
- Risk: LOW
- Depends on: none
- Category: perf
- Planned at: `e88675ff`, 2026-10-30
- Status: TODO


## Why this matters

The audit identified algorithmic costs, not measured user-facing latency. Pond already logs startup milestones and slow operations, but the inspected tooling does not establish repeatable end-to-end budgets for Library browsing and bulk edits. Establish synthetic workloads and separate CPU/database work from model inference before selecting changes.

## Current state and exemplars

- `apps/desktop/src/main/startup-timing.ts:13–40` records startup milestones and probes main-thread stalls:
  ```ts
  marks[mark] = Math.round(performance.now());
  const STALL_PROBE_MS = 100;
  const STALL_REPORT_MS = 200;
  ```
- `apps/desktop/src/main/ipc/queries/index.ts:116–124` measures handler time and logs requests taking at least 100ms. This is not end-to-end UI latency.
- `scripts/check-performance-budgets.mjs` checks build bytes, not interaction latency. Preserve it.
- `apps/desktop/src/main/core/library-query.test.ts:27–48` initializes an in-memory native SQLite database and seeds Saves in one transaction. Reuse that pattern with synthetic data; never open the user's database.
- `apps/desktop/src/main/core/conversion-benchmark.test.ts:16` is the opt-in benchmark exemplar:
  ```ts
  it.skipIf(process.env.POND_BENCH_CONVERSION !== "1")(
  ```
  Its measurements use `performance.now()` and emit JSON.
- `apps/desktop/src/renderer/src/features/saves/lib/mutate.test.ts:22–39` exercises the real pool and injects a pending bridge promise using `vi.stubGlobal("window", ...)`. Match this boundary technique, not module mocks.
- Native database tests may skip under plain Node. Require Electron's Node mode for database measurements.

## Scope

Only create/modify:
- `apps/desktop/src/main/core/library-performance-benchmark.test.ts` (new)
- `apps/desktop/src/renderer/src/features/saves/lib/bulk-performance-benchmark.test.ts` (new)
- `docs/contributing/performance.md` (new runbook)
- `plans/performance-baseline.md` (new measured results and explicit unavailable measurements)
- `plans/README.md` (this status row)

Read-only references include existing startup/IPC instrumentation, query and retrieval implementations, tests, and size-budget script. Do not change production behavior, CI, dependencies, schema, inference settings, or telemetry exports. Retrieval adapter access and native semantic fixtures belong to plan 004.

## Steps

### 1. Add opt-in deterministic microbenchmarks

Create the two benchmark files, gated by `POND_BENCH_LIBRARY=1`. Seed 1k, 10k, and 50k Saves with a fixed generator. Use bounded timeouts, close native connections, and clean temporary resources in finally/afterEach. Use in-memory fixtures for CPU/query comparisons and label them as such; do not call them disk-startup measurements.

Database cases: first page and subsequent pages, no pins versus a small pinned set, recency versus title ordering, a keyword query, and selective versus broad folder scopes. Renderer cases: bulk rating, trash, purge, and rejected-operation rollback with K=1/100/1000 (where K<=N); separate setup cost from operation cost. Observe store publications and validate result counts. Use the existing bridge injection pattern.

Emit one JSON record per case with commit, Node/Electron versions, OS/architecture, workload size, warm-up count, sample count, p50/p95/max elapsed time, and clearly labeled process-memory snapshots. Perform at least 5 warm-ups and 30 measured repetitions; reset fixtures outside each timed region. Do not assert tight millisecond thresholds in ordinary CI.

**Verify:** `pnpm --filter @pond/desktop exec vitest run src/main/core/library-performance-benchmark.test.ts src/renderer/src/features/saves/lib/bulk-performance-benchmark.test.ts` → clean opt-in skips, no mutation or network access.

### 2. Run and record the baseline

Run:
```sh
POND_BENCH_LIBRARY=1 ELECTRON_RUN_AS_NODE=1 pnpm --filter @pond/desktop exec electron node_modules/vitest/vitest.mjs run src/main/core/library-performance-benchmark.test.ts src/renderer/src/features/saves/lib/bulk-performance-benchmark.test.ts
```
Expected: all enabled cases execute, result-count assertions pass, and every size/case emits measured JSON. A 50k case exceeding a bounded timeout is a recorded limitation, not permission for an unlimited run. Record competing runtime activity and rerun noisy cases with the runtime owner's coordination.

Create `plans/performance-baseline.md` with actual results, commands, environment, date, limitations, and raw JSON. Do not infer whole-app memory from the benchmark process.

**Verify:** `test -s plans/performance-baseline.md` → exit 0; repeat the benchmark command → same correctness results and an independently recorded timing sample set.

### 3. Document end-to-end capture and agree budgets

Write `docs/contributing/performance.md`: use existing startup/slow-query/stall logs and DevTools Performance/Memory capture to measure first usable Library, scroll/filter responsiveness, bulk-edit long tasks, and post-idle memory. Require explicit permission for any restart or temporary Library switch in the shared runtime. Document cold/warm state and dev/production build differences.

Semantic measurements must separate encoder cold start, encoder warm execution, and retrieval SQL; plan 004 supplies isolated native SQL benchmarks. Mark startup, renderer traces, and semantic stages "not measured" until real outputs exist. Propose workload-specific budgets from measured baselines, obtain user approval, and record the approval. Do not substitute the skill's generic web targets for desktop measurements.

**Verify:** `test -s docs/contributing/performance.md && test -s plans/performance-baseline.md` → exit 0. If runtime access or budget approval is unavailable, mark this plan BLOCKED with completed microbenchmark evidence; do not fabricate completion.

### 4. Run repository gates

Run `pnpm check` and `pnpm build` → exit 0. Ordinary tests must skip only the opt-in performance cases, not silently skip the required native verification. Run the native baseline command in the repository gates below.

## Test plan and done criteria

- [ ] Opt-in benchmarks execute real query/pool functions with synthetic data, no provider/network calls.
- [ ] Ordinary test invocation skips benchmarks cleanly.
- [ ] Enabled native run executes all declared size/case combinations or records explicit blocked cases.
- [ ] Recorded outputs distinguish microbenchmarks from user-interaction and startup measurements.
- [ ] Approved budgets and actual end-to-end captures exist before marking the full plan DONE.
- [ ] `pnpm check`, `pnpm build`, and native baseline gate pass.
- [ ] Scope review is clean and index status/evidence is updated.

## Specific STOP conditions

Do not restart the shared runtime or switch Libraries without approval. Do not claim a Node heap measurement captures Electron GPU/native memory. If tests cannot load the native ABI, stop rather than changing dependencies.

## Maintenance notes

Keep large benchmarks opt-in and separate from deterministic correctness tests. Timing regression gates require a stable runner and agreed tolerances; setting up that runner is a later approval, not a CI change in this plan. Rebaseline after Electron/model/runtime changes, retaining the previous results.

## Repository rules and execution workflow

Pond is a local-first Electron application. A **Library** is the authoritative on-disk archive; SQLite is its index. A **Save** is one archived item. Main owns persistence and privileged operations; renderer owns presentation and optimistic state. Preserve stored formats, IPC contracts, source identities, and Library isolation.

Read `CONTRIBUTING.md`, `docs/contributing/code-standards.md`, `docs/contributing/architecture.md`, and `CONTEXT.md` before implementation. Use kebab-case files, typed domain interfaces, and colocated tests. Inject external capabilities rather than mocking module imports. Do not weaken lint/type rules or add dependencies without approval.

Use the user-created branch `perf/library-performance`, or an explicitly approved isolated worktree. Preserve unrelated changes. Use Conventional Commits if asked to commit (for example, `perf(desktop): batch optimistic Save updates`); do not commit, push, or open a PR without authorization.

Long-running runtimes are shared and user-owned. Never launch `pnpm dev`, watch processes, or a second app runtime. Use the existing runtime for UI checks. Do not switch the user's active Library or read personal Library data without permission. Only open a dist build after rebuilding the latest changes and coordinating with the runtime owner.

## Repository verification gates

Run commands from the repository root unless stated otherwise.

| Purpose | Command | Expected result |
| --- | --- | --- |
| Required checks | `pnpm check` | Exit 0: lint, architecture, generated-file checks, types, offline tests |
| Production bundles and size budgets | `pnpm build` | Exit 0; performance-size budgets pass |
| Native SQLite baseline | `ELECTRON_RUN_AS_NODE=1 pnpm --filter @pond/desktop exec electron node_modules/vitest/vitest.mjs run src/main/db.test.ts src/main/core/vec-index.test.ts` | Exit 0; native cases execute, not skip |
| Scope review | `git diff --stat; git status --short` | Only authorized files changed, allowing pre-existing user changes |

On PowerShell set `$env:ELECTRON_RUN_AS_NODE="1"` before the native command instead of using the POSIX prefix. Do not rebuild native modules in the shared checkout while the runtime is using them. Stop and coordinate if the native ABI is unavailable.

The commands above are documented repository gates, not claims that the planning session ran them. Individual commands below that reference new benchmark/test files are proposed interfaces to implement, not pre-existing tooling.

## General STOP conditions

Stop and report if an in-scope excerpt no longer matches after the drift check; an unrelated change cannot be preserved; a verification fails twice after a reasonable repair; a change requires files outside scope; or permissions, target hardware, or success criteria are missing. Do not invent benchmark numbers or accept skipped native tests as a pass.

When finished, update only this plan's status and evidence links in `plans/README.md`.
