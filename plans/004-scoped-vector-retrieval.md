# Plan 004: Validate scope-safe vector retrieval optimization

> Executor: this is a measurement and design spike first. Do not ship a new retrieval strategy until the decision gate below is approved.
>
> Drift check: `git diff --stat e88675ff..HEAD -- apps/desktop/src/main/core/library-retrieval.ts apps/desktop/src/main/core/library-retrieval.test.ts apps/desktop/src/main/core/vec-index.ts apps/desktop/src/main/core/vec-index.test.ts`. Inspect uncommitted changes and compare excerpts before editing.

## Status

- Priority: P2
- Effort: L
- Risk: HIGH (filtered recall and model identity)
- Depends on: `plans/001-performance-baseline.md` (measurement format and approved workload targets)
- Category: perf
- Planned at: `e88675ff`, 2026-10-30
- Status: TODO

## Why this matters

The dense retrieval caller always passes a condition. Its SQLite adapter therefore takes an exact cosine-distance scan of matching JSON embeddings, not the vector-table branch. This is certain from the call graph, but the benefit of changing it depends on library size, filter selectivity, vector dimension, and sqlite-vec capabilities. Correct scoped retrieval is more important than a faster but incomplete result list.

## Current state and exemplars

`apps/desktop/src/main/core/library-retrieval.ts:225–249`:
```ts
neighbors(kind, vector, limit, condition) {
  if (!condition) {
    return knnVec(
      db.$raw,
      kind === "text" ? "text" : "clip",
      vector,
      limit,
    );
  }
  const column = kind === "text" ? saves.embedding : saves.clipEmbedding;
  const distance = sql<number>`vec_distance_cosine(${column}, ${JSON.stringify(vector)})`;
  // Scope, non-null embedding and dimension predicates, then:
  // .orderBy(distance).limit(limit).all()
}
```
`denseChannel` always calls neighbors with:
```ts
and(
  ...clauses,
  eq(
    kind === "text" ? saves.embeddingModel : saves.clipModel,
    vector.model,
  ),
),
```
It also validates admitted IDs afterward. Preserve these restrictions.

`apps/desktop/src/main/core/vec-index.ts` creates:
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS <table> USING vec0(
  save_id TEXT PRIMARY KEY,
  embedding FLOAT[<dimensions>]
);
```
These tables have no model or folder partition column. `knnVec` uses `embedding MATCH ? AND k = ?`. Do not assume this is approximate/sublinear indexing; benchmark the installed extension. `ensureKind` can drop a table when dimensions change, so mixed-dimension completeness cannot be assumed.

Existing `library-retrieval.test.ts` injects a `RetrievalStore` and tests service behavior, not the actual SQLite adapter. `vec-index.test.ts` tests sqlite-vec directly using `loadSqliteVec`, `ensureVecTables`, and `upsertVec`. Use both patterns, plus a native integration test that covers the real adapter.

## Scope

Only create/modify:
- `apps/desktop/src/main/core/library-retrieval.ts` (narrow dependency-injected native entry for tests; behavior change only after approval)
- `apps/desktop/src/main/core/library-retrieval.test.ts`
- `apps/desktop/src/main/core/library-retrieval-native.test.ts` (new)
- `apps/desktop/src/main/core/library-retrieval-benchmark.test.ts` (new)
- `apps/desktop/src/main/core/vec-index.ts` (only after approval)
- `apps/desktop/src/main/core/vec-index.test.ts`
- `plans/vector-retrieval-decision.md` (new decision/evidence)
- `plans/performance-baseline.md` (append actual results)
- `plans/README.md` (status row)

Out of scope: schema migrations, persistent vector-table format changes, model selection/quantization, encoder lifecycle, UI, source crawling, external vector databases, IPC contracts, or worker ownership. A design requiring these changes needs a separate approved implementation plan.

## Steps

### 1. Expose the native adapter to tests without global state

Use the existing `retrieveLibraryWithDb(db, input, scope, queryEmbeddings)` boundary, currently private, as a narrow exported testable domain operation if appropriate. It already accepts dependencies and avoids calling an encoder. Do not expose this through IPC or have tests open `getDb()`.

Add real-native tests using in-memory initialized SQLite and deterministic embeddings. Require native availability under Electron; missing sqlite-vec must fail the native test. Ensure every connection closes.

Cases: text/media channels, selective folders, source/media restrictions, empty attachment scope, deleted Saves, excluded visual Save, mixed model IDs sharing a dimension, absent/mismatched dimensions, missing vector-table entries, and fewer than K eligible results. Compare against an exact scoped reference; use distinct distances for strict ordering and documented tie handling otherwise.

**Verify:**
```sh
ELECTRON_RUN_AS_NODE=1 pnpm --filter @pond/desktop exec electron node_modules/vitest/vitest.mjs run src/main/core/library-retrieval.test.ts src/main/core/library-retrieval-native.test.ts src/main/core/vec-index.test.ts
```
→ real native cases execute and pass; no network/model downloads.

### 2. Benchmark current behavior and prototype supported candidates

Create an opt-in `POND_BENCH_LIBRARY=1` benchmark following `conversion-benchmark.test.ts`'s environment gate and JSON reporting. Use deterministic 1k/10k/50k datasets, current configured embedding dimensions, and broad/1%/10% scopes. Keep setup and model inference outside timed regions. Use bounded timeouts and at least 5 warm-ups/30 samples, reporting memory and database size where measured.

Check actual installed sqlite-vec documentation/capabilities before prototyping a scope-aware candidate. Test whether eligible-ID restrictions can participate in KNN rather than assuming support. Keep prototypes test-only until approved.

**Forbidden shortcut:** global top-K followed by scope filtering. It can return fewer eligible results even when enough exist. Fixed oversampling is not a correctness guarantee either. An adaptive strategy needs an explicit completeness proof or exact fallback and must account for missing/stale vector rows and mixed models.

**Verify:**
```sh
POND_BENCH_LIBRARY=1 ELECTRON_RUN_AS_NODE=1 pnpm --filter @pond/desktop exec electron node_modules/vitest/vitest.mjs run src/main/core/library-retrieval-benchmark.test.ts
```
→ measured JSON for declared cases and exact-reference assertions pass. Ordinary invocation without the flag skips only benchmark cases.

### 3. Write the decision and obtain approval

Create `plans/vector-retrieval-decision.md` with:
- Current JSON-scan time versus candidate time, memory, selectivity, dataset size, dimensions, and environment.
- Actual extension version and supported filtering mechanism.
- Scope/model/correctness and index-completeness arguments, including stale/missing entries.
- Main-thread blocking implications; faster SQL remains synchronous.
- Options: retain exact scan, a proven scoped vector path with exact fallback, or a separately planned schema/worker change.
- A concrete recommendation and acceptance threshold approved by the user.

**Verify:** `test -s plans/vector-retrieval-decision.md` → exit 0 and step 1 native tests still pass. Pause for user approval. Mark BLOCKED awaiting approval rather than implementing a speculative path.

### 4. Implement only the approved in-scope option

If the approved option fits the scope, implement it in the existing retrieval adapter/vec helper. Preserve exact filtering, model identity, dimension guards, source exclusions, lexical/dense fusion, and error behavior. Retain the exact path for cases whose completeness is not established. Do not use fallback silently to hide correctness failures.

If measurements support keeping the exact scan, leave production behavior unchanged and mark the optimization REJECTED with evidence; completing the spike does not require shipping a change.

**Verify:** rerun native test and benchmark commands from steps 1–2 → result parity, improved measured workloads, and documented fallback cases. Run `pnpm check`, `pnpm build`, and the native baseline gate → exit 0.

## Test plan and done criteria

- [ ] Real adapter integration tests exercise native SQLite and sqlite-vec, not only an injected store.
- [ ] Exact-reference parity holds across scopes, models, dimensions, missing vector rows, and exclusions.
- [ ] Dataset/environment metadata and actual timing results recorded.
- [ ] Decision document has explicit user approval before production changes.
- [ ] No fixed global top-K/post-filter substitute accepted as exact retrieval.
- [ ] Approved gates pass, scope reviewed, index updated; or measured no-change verdict recorded.

## Specific STOP conditions

Stop if the installed extension cannot express the required filtering, a candidate needs schema migration, results lose valid scoped matches, index completeness is unknown, or native tests skip. Do not relax model/scope predicates to reach the fast branch.

## Maintenance notes

Embedding-model changes, vector dimensions, backfill behavior, deletion triggers, and new filters can invalidate a fast path's guarantees. Re-run the native parity suite on each such change. Encoder cold-start and worker lifecycle optimization is separate from retrieval SQL; do not attribute encoding latency to SQLite.

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
