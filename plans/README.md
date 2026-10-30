# Performance implementation plans

Prepared 2026-10-30 against `e88675ff`. Working branch: `perf/library-performance`.

These are handoff plans, not implemented fixes. The audit was source-level; no runtime measurements or test execution were claimed. Read each plan fully, honor STOP conditions, and preserve unrelated work. Do not commit or push without authorization.

## Execution order and status

| Plan | Workstream | Priority | Effort | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| [001](001-performance-baseline.md) | Establish repeatable local baselines | P1 | M | — | BLOCKED: UI captures deferred; microbenchmark targets approved 2026-10-30; [two native baseline runs](performance-baseline.md), [capture runbook](../docs/contributing/performance.md) |
| [002](002-batch-bulk-updates.md) | Batch optimistic bulk Save updates | P1 | M | 001 bulk evidence/target | DONE: approved tie-order fix, batched application/rollback, publication bounds and timing targets passed; [results](performance-baseline.md#plan-002-completed--2026-10-30) |
| [003](003-library-pagination.md) | Verify and optimize common pagination | P2 | M | 001 query evidence/target | DONE: unpinned recency fast path, native correctness and two measured target passes; [query plans/results](performance-baseline.md#plan-003-completed--2026-10-30) |
| [004](004-scoped-vector-retrieval.md) | Validate scope-safe vector retrieval | P2 | L | 001 measurement protocol/targets | REJECTED: user approved retaining exact scan; prototype slower in all 16 comparable workloads; gates passed, 4 timing phases explicitly bounded; [decision/evidence](vector-retrieval-decision.md) |

Status values: TODO, IN PROGRESS, DONE, BLOCKED (reason), REJECTED (evidence).
Add execution results and links to measured evidence when updating a row.

## Dependency notes

1. Begin with 001. Separate synthetic/native microbenchmarks from existing-runtime UI captures. Missing runtime permission may block UI captures without blocking completed microbenchmark work.
2. Execute 002 first after its relevant baseline exists; it has the clearest structural verification.
3. Execute 003 next. Confirm query plans before implementing a fast path.
4. Execute 004 as a spike with an explicit approval gate, not an unconditional vector rewrite.
5. Plans 002–004 are not logically dependent on one another, but all append to the baseline report. Serialize shared-file updates to avoid collisions.
6. Deterministic correctness and publication-count tests belong in normal verification. Wall-clock regression thresholds require approved budgets and a stable runner; no CI configuration changes are authorized here.

## Findings considered and rejected or deferred

- Blanket cloud/CDN/APM rollout: inappropriate default for this local-first desktop audit.
- “No observability”: rejected; startup milestones, main-thread stalls, slow IPC logs, and bundle budgets already exist. Extend them.
- “Missing recency index”: rejected; `packages/schema/src/db.ts` already defines `saves_saved_at_id_idx`. Investigate the actual SQL ordering.
- Unbounded startup snapshot: rejected for the inspected path; snapshot writes/initial hydration are capped at 250.
- Full-pool hydration as the primary current bottleneck: not established; no production caller was found for `hydrateFullPool` in the inspected renderer.
- Removing exact counts or caching them blindly: rejected; current tests require exact totals after intervening writes.
- Global vector top-K followed by filtering: rejected as an exact scoped-retrieval substitute; can lose eligible results.
- Reworking inference worker lifecycle: deferred; recent commit already addresses serialization, memory-pressure pacing, and idle release.
- General pool eviction, SQLite worker migration, and new database indexes: deferred until measurements justify separate designs.

## Scope and safety

No production load testing, external service changes, dependency installations, or new development runtimes are authorized. Use synthetic fixtures and the existing shared runtime only with permission for disruptive actions. No personal Library, credentials, query text, or private file paths should be copied into results.

The source audit emphasized desktop Save state, SQLite pagination/retrieval, and existing measurement tooling. It did not deeply audit media conversion, ingestion, website rendering, extension runtime performance, or real production/user workloads.
