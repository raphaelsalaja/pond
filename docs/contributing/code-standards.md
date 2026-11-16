# Code standards

These standards apply to hand-written repository code. Generated output follows its generator; fix the generator when output violates a rule. Check in the corresponding output when the required generation tools are available. Biome owns formatting. Oxlint owns the additional type and test rules. Both are required checks.

## Naming and files

Use Pond's domain names from [CONTEXT.md](../../CONTEXT.md). Files and directories use kebab-case; components and types use PascalCase; functions and values use camelCase. Name an operation for what it does: `createTag`, `loadNextPage`, `cancelSync`.

Keep names required by tooling: TanStack route filenames such as `__root.tsx` and `$saveId.tsx`, Next.js `page.tsx` and `layout.tsx`, WXT entrypoints, configuration files, generated `routeTree.gen.ts`, and generated icon component names. Existing shared UI package entrypoints remain stable public imports.

A styled component owns a folder with `index.tsx` and `styles.module.css`. Colocate its tests in that folder. CSS-less helpers and domain modules use descriptive kebab-case filenames. A directory groups a cohesive module, and `index.ts` exposes its deliberate public interface. Export the operations callers need, not internal helpers. Avoid broad feature barrels that eagerly import optional UI or workers.

## Ownership and dependencies

Each feature owns its UI, hooks, state, operations, and tests. Application composition wires features together. Shared modules contain reusable infrastructure and primitives and must not import feature implementations. Main and renderer implementations must not import one another; exchange domain contracts through preload and shared schemas. An entrypoint composes dependencies; lower-level code does not import it to obtain runtime services.

Use direct imports from an owning module’s exported entry when crossing a feature boundary. The architecture check detects runtime cycles, process violations, renderer shared-code violations, and imports below another feature's root entries. Review what each feature entry exports for ownership as part of the PR.

A module's public interface is the information callers need to use it correctly. Keep that interface smaller than the implementation it hides. Add an adapter when there is a real external dependency to replace, not in anticipation of hypothetical implementations. Keep persistence, Electron, network, and UI effects outside pure domain transformations.

## Types and external input

Use the type supplied by the owner of a value. Derive types from schemas rather than copying their definitions. Parse external input at its I/O boundary, then pass domain values into the application. Preserve existing serialized formats and supported input behavior unless the change explicitly migrates them.

The custom lint rules prohibit module mocking, runtime `typeof`, broad `object`/`unknown` contracts, chained assertions, and widening a known value only to assert it back. A necessary assertion must have a local `/** SAFETY: … */` comment stating the verified invariant. Do not use a cast, suppression, or a weaker rule to conceal a mismatch. Discriminated unions describe states that have different valid data.

Name input types for their domain meaning. Use parameter objects when their named fields make a call clearer; the broad TypeScript `object` type is not a domain contract. Keep error results meaningful and preserve failure propagation. Optional data and failed operations are different states.

## React and UI

Use function components with explicit props. Keep domain mutations in operations and transport in adapters. Derive values during rendering instead of maintaining duplicate state. Effects synchronize with external systems and clean up subscriptions, timers, and resources. State updates use current-state callbacks when they depend on previous state.

Reuse the shared UI package and theme tokens. Preserve keyboard access, labels, focus behavior, loading and empty states, and reduced-motion behavior. Follow [design principles](../../apps/desktop/src/renderer/src/PRINCIPLES.md). Keep lazy imports for optional viewers, galleries, and inference workers. File organization must not change when code is loaded.

## Shared UI components

A component in `packages/ui` ships when it meets every item on this list:

- `examples.tsx` exports its `ComponentDocs`: summary, parts, keyboard map, accessibility notes, and one example per state. Register it in `packages/ui/src/docs.ts`. The website's `/design` route renders it from there.
- Every example renders with an accessible name for each control. `conformance.browser.test.tsx` runs axe on each example in the light and dark themes.
- Each example has a light and dark screenshot baseline. Baselines come from Linux, so update them with the `Visual Baselines` workflow and commit the files it produces.
- Interactive components have an `index.browser.test.tsx` that drives the WAI-ARIA keyboard pattern in a real browser: reaching the control with Tab, its keys, disabled states, and focus return after a popup closes.
- Transitions and animations respect `prefers-reduced-motion`.
- Icon-only controls require an accessible name in their props.
- Every component folder has a `package.json` subpath.

Keyboard, focus, and popup behavior comes from Base UI. Behavior Base UI lacks, such as reorder, resize, trees, and roving grids, comes from UI SDK inside `packages/ui`. Apps import neither library directly.

## Tests

Test observable behavior through the same interface used by callers. A component may expose typed data, commands, or child slots so its behavior can be tested separately from application composition. Keep the real UI and browser interactions in those tests. Inject external dependencies and use faithful test implementations, temporary directories, and deterministic fixtures. Do not use Vitest/Jest module mocks or replace an imported implementation globally. A fake must model the contract's success, failure, and cleanup behavior; it must not merely mirror the implementation under test.

Cover regressions with a failing scenario before the fix when practical. Structural moves reuse existing behavioral tests; do not add assertions that simply repeat filenames or implementation statements. Architecture checks enforce import rules separately. Offline tests gate PRs. Live source checks remain opt-in or scheduled.

## Comments and reviews

Explain a constraint, invariant, or tradeoff that the code cannot express. Keep safety comments adjacent to assertions. Remove comments made obsolete by a refactor. Document changes to module ownership or external contracts in the architecture reference.

Keep file moves and semantic refactors separately reviewable. A PR describes the problem, resulting behavior, validation, and compatibility impact. Existing libraries, preferences, source identifiers, and extension protocols are preserved unless an explicit migration is part of the change.
