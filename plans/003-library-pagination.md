# Plan 003: Verify and optimize common Library pagination

> Executor: follow the steps and preserve exact paging semantics.
>
> Drift check: `git diff --stat e88675ff..HEAD -- apps/desktop/src/main/core/library-query.ts apps/desktop/src/main/core/library-query.test.ts packages/schema/src/db.ts`. Inspect uncommitted changes too; compare excerpts before editing.

## Status

- Priority: P2
- Effort: M
- Risk: MED
- Depends on: `plans/001-performance-baseline.md` (native query measurements and approved comparison target)
- Category: perf
- Planned at: `e88675ff`, 2026-10-30
- Status: TODO

## Why this matters

Every page executes an exact count and computes a pin-rank expression, even when there are no pinned Saves. The resulting ordering may prevent efficient use of the existing recency index. This is a query-plan hypothesis, not a measured missing-index finding. Confirm it before implementing a narrowly scoped fast path.

## Current state

`apps/desktop/src/main/core/library-query.ts:122` constructs:
```ts
pinRank: sql`coalesce((select cast(key as integer) from json_each(${pinKey}) where value = ${saves.id} limit 1), ${UNPINNED_RANK})`,
```
`queryLibraryPage` counts in a transaction, then orders the page:
```ts
const total =
  db.select({ count: count() }).from(saves).where(where).get()?.count ?? 0;
// ...
.orderBy(
  asc(pinRank),
  asc(sql`${column} is null`),
  ascending ? asc(column) : desc(column),
  desc(saves.id),
)
```
`queryLibraryIds` uses the same general ordering. Cursor tie breaking always uses descending ID. Pin rank is optional in returned cursors when unpinned.

`packages/schema/src/db.ts:239` already defines:
```ts
savedAtIdIdx: index("saves_saved_at_id_idx").on(
  sql`${t.savedAt} DESC`,
  sql`${t.id} DESC`,
),
```
`savedAt` is non-null. Do not report that its index is missing.

`apps/desktop/src/main/core/library-query.test.ts` is the native test exemplar. It uses an in-memory database, `initializePondSchema`, transactional fixtures, and real queries. Existing tests require stable ties, nulls last, exact totals after intervening writes, pin ordering, cross-Library rejection, and stale-sort cursor rejection.

## Scope

Only modify/create:
- `apps/desktop/src/main/core/library-query.ts`
- `apps/desktop/src/main/core/library-query.test.ts`
- `apps/desktop/src/main/core/library-performance-benchmark.test.ts` (from 001)
- `plans/performance-baseline.md` (query plans and measurements)
- `plans/README.md` (status row)

Read-only: schema/index definitions, `main/core/active-library-query.ts`, shared Library query contracts, renderer query session.
Out of scope: schema/index migrations, count caching, cursor shape changes, approximate totals, moving SQLite to a worker, and UI changes. If an index migration or count cache appears necessary, produce a separately approved follow-up; this plan must not silently grow into either.

## Steps

### 1. Capture actual native query plans

Extend the opt-in benchmark to capture the SQL and parameters emitted by the actual query builder. Use Drizzle's supported logger/SQL inspection mechanisms; do not handwrite an approximate SQL statement and label it production SQL. Execute `EXPLAIN QUERY PLAN` against those statements on the same synthetic database.

Capture first/next page and all-IDs query shapes for recency ascending/descending, empty/nonempty pins, broad/selective filters, and title ordering. Measure count and row-query stages separately as well as overall latency. Report use of temp sorting and indexes without asserting brittle full planner output.

**Verify:**
```sh
POND_BENCH_LIBRARY=1 ELECTRON_RUN_AS_NODE=1 pnpm --filter @pond/desktop exec electron node_modules/vitest/vitest.mjs run src/main/core/library-performance-benchmark.test.ts
```
→ cases execute and report actual SQL plans/timings. If there is no material cost in the suspected ordering, stop and record the hypothesis as rejected; do not add a speculative optimization.

### 2. Add differential paging tests

Expand native query tests with repeated timestamps, both sort directions, pinned IDs outside the scope, deleted/incomplete Saves, empty results, multiple pages, and intervening writes. Compare concatenated paged IDs with `queryLibraryIds`; ensure no duplicates/omissions and exact totals on each observed snapshot. Retain null-sort coverage for nullable fields.

**Verify:**
```sh
ELECTRON_RUN_AS_NODE=1 pnpm --filter @pond/desktop exec electron node_modules/vitest/vitest.mjs run src/main/core/library-query.test.ts
```
→ all old and new tests execute and pass under the current implementation.

### 3. Implement only a proven common-case fast path

If step 1 supports it, avoid the correlated pin-rank ordering when `pinnedIds.length === 0`. For non-null recency ordering, avoid a redundant null-placement expression. Simplify cursor predicates for this path while preserving sort signature, ID tie breaker, library identity, rank conventions, and exact results. Keep the general path for pins, nullable sorts, manual ordering, and random ordering.

Share only the ordering/predicate logic needed by page and all-IDs operations; preserve current interfaces. Do not reuse stale totals: the exact count stays inside the read transaction. Document any remaining count cost in the results as a separate candidate.

**Verify:** repeat the native query test command from step 2 → all tests pass. Repeat the benchmark command from step 1 → fast-path plan evidence and measured benefit, with no result differences.

### 4. Final verification

Append before/after plans and measured sample distributions to `plans/performance-baseline.md`. Evaluate the approved budget on the same machine/data; record unchanged or slower cases honestly.

Run `pnpm check`, `pnpm build`, and the native baseline gate → exit 0. Run the focused native query tests explicitly; Node skips do not count.

## Test plan and done criteria

- [ ] Native pagination correctness tests execute and pass, including cross-page ties and writes.
- [ ] First/next-page and all-IDs results agree for supported cases.
- [ ] Exact totals, scoped visibility, pin order, nullable sorts, and cursor validation remain unchanged.
- [ ] Actual SQL plans and timings demonstrate improvement, or the hypothesis is recorded as rejected without a production change.
- [ ] No schema/contract change or count cache introduced.
- [ ] Repository gates pass; scoped diff and index status reviewed.

## Specific STOP conditions

Stop if removing expressions changes cursor compatibility or null semantics. Stop before changing schema or weakening the exact-total contract. A planner improvement without a repeatable workload benefit is insufficient justification to merge complexity.

## Maintenance notes

Changes to pinned ordering, sort projections, filter compilation, or SQLite version must rerun these native tests and benchmarks. Avoid asserting exact EXPLAIN text across SQLite versions. Count caching requires explicit Library/revision invalidation design and is intentionally deferred.

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
