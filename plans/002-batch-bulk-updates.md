# Plan 002: Batch optimistic bulk Save updates

> Executor: read fully, run each verification, and honor STOP conditions.
>
> Drift check: `git diff --stat e88675ff..HEAD -- apps/desktop/src/renderer/src/features/saves/state/pool.ts apps/desktop/src/renderer/src/features/saves/lib/mutate.ts apps/desktop/src/renderer/src/features/saves/lib/mutate.test.ts`. Also inspect uncommitted changes. Compare the excerpts below before editing.

## Status

- Priority: P1
- Effort: M
- Risk: MED
- Depends on: `plans/001-performance-baseline.md` (bulk microbenchmark results and an approved comparison target; other baseline measurements may remain blocked)
- Category: perf
- Planned at: `e88675ff`, 2026-10-30
- Status: TODO

## Why this matters

A bulk operation loops over loaded Saves and publishes each update separately. Each publication traverses the sorted pool, producing roughly O(K×N) work for K updates in an N-Save pool. Rollback repeats the problem. Batch each phase without changing the main-owned transaction or optimistic behavior.

## Current state

`apps/desktop/src/renderer/src/features/saves/state/pool.ts:112–124`:
```ts
s.byId.set(save.id, save);
const sorted =
  prev && savedAtMs(prev) === savedAtMs(save)
    ? s.sorted.map((row) => (row.id === save.id ? save : row))
    : sortByRecency(s.byId.values());
return { byId: s.byId, sorted, revision: s.revision + 1 };
```

The same file already exports `bulkUpsertSaves` and `onPoolDirty`. Its bulk fast path requires incoming recency order; unordered selections can fall back to one sort. One O(N log N) batch is acceptable initially; do not redesign pool ownership to chase O(N).

`apps/desktop/src/renderer/src/features/saves/lib/mutate.ts:148–175`:
```ts
for (const save of before) {
  if (operation.kind === "purge") pool.delete(save.id);
  else if (operation.kind === "trash")
    pool.upsert({ ...save, deletedAt: Date.now() });
  // Other supported optimistic edits also upsert one Save at a time.
}
// catch:
for (const save of before) pool.upsert(save);
```
`targets` deduplicates all requested IDs; `before` contains only loaded Saves. The IPC call must retain cold IDs.

Use the real-pool test pattern in `apps/desktop/src/renderer/src/features/saves/lib/mutate.test.ts`:
```ts
const pending = Promise.withResolvers<void>();
const tx = vi.fn(() => pending.promise);
vi.stubGlobal("window", { pond: { tx } });
```
Tests reset the pool and unstub globals. Preserve this faithful transport boundary rather than mocking imports.

## Scope

Only modify/create:
- `apps/desktop/src/renderer/src/features/saves/state/pool.ts`
- `apps/desktop/src/renderer/src/features/saves/state/pool.test.ts` (new)
- `apps/desktop/src/renderer/src/features/saves/lib/mutate.ts`
- `apps/desktop/src/renderer/src/features/saves/lib/mutate.test.ts`
- `apps/desktop/src/renderer/src/features/saves/lib/bulk-performance-benchmark.test.ts` (created by 001)
- `plans/performance-baseline.md` (append measured comparison)
- `plans/README.md` (status row)

Out of scope: main transaction executor, IPC contracts, enrichment, bootstrap pruning, sync coalescing, UI presentation, pool eviction, and saved-at sort semantics. Preserve existing concurrent-edit behavior; if tests expose a separate concurrency bug, report it instead of silently changing policy.

## Steps

### 1. Characterize bulk behavior before batching

Expand `mutate.test.ts` to cover duplicate IDs, loaded plus cold IDs, empty selection, trash/untrash/purge/rating/notes/tag replacement, rating exclusion for trashed Saves, and tag add/remove retaining their current non-optimistic behavior. Exercise success and rejection using deferred bridge responses. Check pool snapshots as well as keyed reads; verify order and dirty IDs. Initially test behavior without imposing a publication count the current implementation cannot satisfy.

**Verify:** `pnpm --filter @pond/desktop exec vitest run src/renderer/src/features/saves/lib/mutate.test.ts` → all characterization tests pass.

### 2. Add a batched deletion primitive

Add a narrow pool operation for deleting multiple IDs in one `setState`. Deduplicate IDs, remove only present Saves, filter sorted rows once, advance revision once when something actually changed, and emit dirty IDs once after publication. An all-missing/empty deletion is a no-op. Keep existing single-delete behavior intact.

Create `pool.test.ts` with tests for empty/missing/duplicate IDs, survivor order, keyed/snapshot consistency, one revision increment, one publication, and one dirty notification. Unsubscribe listeners in cleanup. Use `savesStore.subscribe` or the current public subscription API; do not spy on implementation internals.

**Verify:** `pnpm --filter @pond/desktop exec vitest run src/renderer/src/features/saves/state/pool.test.ts src/renderer/src/features/saves/lib/mutate.test.ts` → all pass.

### 3. Batch optimistic application and rollback

In `bulkMutation`, build updated Saves first; call `pool.bulkUpsert` once when nonempty. Use the batched deletion operation for purge. Retain every deduplicated target in the single `saves.bulkEdit` request. Keep existing per-operation eligibility rules and success feedback. On rejection restore `before` with one bulk upsert and rethrow.

Add publication-count tests after initialization: one publication for a changing optimistic phase and one for its rollback; no publication for an empty/no-op phase. Confirm purge rollback restores ordering and all prior fields. Do not suppress dirty notifications to make the count test pass.

**Verify:** same focused test command as step 2 → all pass, including new publication bounds.

### 4. Compare scaling and run gates

Run:
```sh
POND_BENCH_LIBRARY=1 ELECTRON_RUN_AS_NODE=1 pnpm --filter @pond/desktop exec electron node_modules/vitest/vitest.mjs run src/renderer/src/features/saves/lib/bulk-performance-benchmark.test.ts
```
Expected: all benchmark correctness assertions pass; one pool publication per changing phase, rather than K. Append before/after timing and workload metadata to the baseline report. Check the agreed timing target; if improvement is absent, report rather than expanding scope.

Run `pnpm check` and `pnpm build` → exit 0.

## Test plan and done criteria

- [ ] Focused pool/mutation tests pass for all operation types and failure paths.
- [ ] Cold IDs still reach main even though they are absent from the renderer pool.
- [ ] Dirty notification batches contain exactly changed IDs; unchanged survivors retain order.
- [ ] No loop in `bulkMutation` performs individual pool writes in application or rollback.
- [ ] Benchmark records structural publication bounds and actual timing comparisons.
- [ ] Repository gates pass and only scoped files change.
- [ ] Index row contains outcome and evidence.

## Specific STOP conditions

Stop if store subscribers require intermediate per-Save states, one batch changes tied recency ordering, or rollback cannot preserve existing behavior. Do not silently introduce a new concurrency/merge policy.

## Maintenance notes

Any new bulk operation must be added to the optimistic transformation and rollback tests. Review notification consumers whenever changing batch semantics. A general pool replacement API or bootstrap deletion batching is intentionally deferred.

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
