# Contributing

## General

- **Node** 24 and **pnpm** 11.27.0 (see `.nvmrc` and `package.json`).
- **Style**: [Biome](https://biomejs.dev/) handles formatting; `pnpm lint` and `pnpm oxlint` check the repository standards.
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint + husky.
- **Checks**: run `pnpm check` and `pnpm build` before opening a PR. CI also verifies generated source documentation, and it runs the build, tests, and desktop smoke test on Ubuntu, Windows, and macOS.
- **PRs**: Keep scope focused; link issues when relevant. Generated source documentation must stay in sync: run `pnpm generate` after descriptor changes.

## Engineering standards

Read [code standards](docs/contributing/code-standards.md) for naming, interfaces, React, types, and tests. Read [desktop architecture](docs/contributing/architecture.md) when adding a feature or changing ownership or process interfaces. Both human and automated contributors use these documents.

Turborepo owns the build, typecheck, test, generation-check, and repository verification graphs. A transit task makes source-first package changes invalidate consuming apps without serializing unrelated work. Package-level `turbo.json` files define framework inputs and reusable outputs.

`pnpm check` runs Biome, Oxlint, Knip, architecture checks, non-mutating generated-file checks, type checks, and offline tests in one cacheable graph. `pnpm architecture:check` runs the focused architecture task. `pnpm build` verifies production bundles and performance budgets. `pnpm lint:fix` applies safe fixes explicitly; `pnpm format` formats files. Pre-commit checks never rewrite your working tree.

Run `pnpm generate` only when you intend to update tracked generated files. Run `pnpm generate:check` to verify them without writing. CI runs both the non-mutating checks and a generated diff gate.

CI can share task artifacts through Vercel Remote Cache. Configure a Turborepo CLI OIDC policy for the repository and set the `TURBO_TEAM` GitHub Actions variable. Workflows skip remote authentication when the variable is absent.

Use `pnpm knip` when removing unused code or dependencies. Check worker, HTML, generated, and dynamic entrypoints before accepting a deletion.

`ELECTRON_RUN_AS_NODE=1 pnpm --filter @pond/desktop exec electron node_modules/vitest/vitest.mjs run src/main/db.test.ts src/main/core/vec-index.test.ts` runs the native database checks with Electron’s ABI. CI runs this separately from the Node test suite.

After building the desktop, `pnpm --filter @pond/desktop exec electron scripts/smoke-desktop.cjs` verifies visible startup and preload queries using a temporary isolated library. It requires a desktop session. `pnpm --filter @pond/desktop exec electron scripts/smoke-agent-stream.cjs` verifies reply streaming, completion, and cancellation through the real isolated preload bridge with offline fixtures and no provider credentials. `pnpm --filter @pond/desktop exec electron scripts/smoke-agent-operations.cjs` checks capability registration, persisted review, replay prevention, and Undo using a temporary isolated Library.

The desktop package also retains focused manual checks outside `pnpm check`. Run `pnpm --filter @pond/desktop smoke:folder-tags` for folder rules, Undo, import recovery, and transfers. Run `pnpm --filter @pond/desktop smoke:library-trust` for backup manifests and detection of password-protected folders in imported Eagle metadata. These checks require a built desktop and a desktop session. Run `pnpm --filter @pond/desktop smoke:sensitive-content` to download the pinned on-device model, verify its checksum, and exercise one inference without Electron.

Use temporary libraries and fixtures in tests. Never require a contributor's personal library, source accounts, or API keys for a PR check. Keep live source tests separate.

## Windows development

Pond builds and runs on Windows 10 and 11 (x64). In addition to Node 24 and pnpm 11.27.0:

- Install the **Visual Studio C++ Build Tools** (the "Desktop development with C++" workload, which includes MSVC and the Windows SDK). `pnpm dist:win` compiles the native messaging host, `pond-native-host.exe`, with `cl` and finds it through Visual Studio's `vswhere`. Set `CC` to use a different MSVC-compatible compiler.
- Install Python 3, which `node-gyp` uses if a native module has to be rebuilt.
- Enable long paths before cloning, because the repository has paths deeper than the 260-character Windows limit: `git config --global core.longpaths true` (or `git clone -c core.longpaths=true`). Also turn on long path support in Windows if installs fail with path-length errors.
- Some tests create symbolic links. Without Developer Mode or the symlink privilege they skip those cases instead of failing.

`pnpm dev`, `pnpm check`, and `pnpm build` work as on macOS. To produce the installer:

```bash
pnpm dist:win
```

This builds the desktop app and extension, compiles the native host, and writes `Pond-X.Y.Z-x64.exe` and `latest.yml` to `apps/desktop/dist/`. Local builds are unsigned, so SmartScreen may warn when you run them. Windows on Arm is not supported yet.

After `pnpm build`, run the end-to-end smoke test from a normal desktop session (it opens a window and uses a temporary isolated library):

```bash
pnpm --filter @pond/desktop smoke:desktop
```

Pull requests that touch the desktop app, extension, or packages also run [`package.yml`](.github/workflows/package.yml), which builds unsigned test installers. Reviewers can download `Pond-windows-x64` (the installer and `latest.yml`) and `Pond-macos` (Apple Silicon and Intel disk images) from the workflow run's artifacts; they are kept for 7 days and cannot auto-update. The same workflow can be started manually with `workflow_dispatch`.

Keep platform-specific code behind `process.platform` checks and add tests that pass the platform in as a parameter, so Windows and macOS behavior is covered on every CI runner.

## Add a source

A source is a site Pond can capture saves from. Add its shared descriptor and
main-process extractor, then update the registries and tests listed below.
The descriptor supplies common facts; total TypeScript records catch missing
registrations.

The model is borrowed from [yt-dlp](https://github.com/yt-dlp/yt-dlp): a
source's URL matching, auth, and extraction logic live together, and embedded
tests travel with the code.

### Workflow

```bash
# Add the descriptor, extractor, and registry entries described below.
pnpm test              # offline tests
pnpm generate          # refresh docs/supported-sources.md
pnpm typecheck         # fix every error the compiler points at
```

### 1. The descriptor (cross-runtime, the single source of truth)

`packages/schema/src/sources/registry.ts` holds one `SOURCE_DESCRIPTORS` entry
per external source:

```ts
{
  id: "vimeo",                 // stable id; also the value stored in the DB
  label: "Vimeo",              // human-facing name
  hosts: ["vimeo.com"],        // apex hosts (matched directly or as a suffix)
  urlPatterns: [/.../],        // patterns identifying a saveable item URL
  // Optional — only if the source can sync a saved list. Omit for
  // capture-only sources (defaults to no list sync).
  sync: { strategy: "scroll" }, // "cursor" | "scroll" | "full" | "none"
}
```

Adding an entry automatically widens the `Source` union (`@pond/schema/db`) and
re-derives `sourceLabel` / `isSource` / `hostToSource` (`@pond/schema/sources`).
The descriptor is the **only** place these cross-runtime facts are defined.

#### Sync + rate limiting (account safety)

If the source can sync a user's saved list, declare `sync` on the descriptor.
`strategy` tells the sync engine how the list is walked so it can **stop early**
once it reaches items you already have:

- `cursor` — API pagination with a cursor (newest-first); early-stops on known ids.
- `scroll` — DOM infinite-scroll (newest-first); early-stops on known ids.
- `full` — no reliable ordering; must walk everything (use sparingly).
- `none` — no list sync (the default; capture-only).

You almost never need to set `rate`. Every source inherits a conservative,
account-safe profile (`DEFAULT_RATE_PROFILE`: ~1 request / 1.5s, ≤60/min, paced
2× slower on the first full sync). The rate **governor**
(`apps/desktop/src/main/core/pipeline/rate-governor.ts`) enforces this for both
list harvest and pipeline ingest, respects platform rate-limit headers, and
persists cooldowns across restarts. Only override `rate` (e.g.
`rate: { minDelayMs: 2500, maxPerWindow: 30 }`) when a platform is unusually
strict — and always err slower. The governing rule is **it is always better to
sync slowly than to risk a user's account.** Use `syncConfigFor(id)` to read the
resolved config; never read `descriptor.sync` directly.

### 2. The extractor (main-process, where the logic lives)

`apps/desktop/src/main/core/pipeline/extractors/sources/<id>.ts` implements the
`Extractor` interface. It co-locates everything specific to the source:

- `validUrl` — read from `descriptorFor("<id>").urlPatterns`
- `cookieDomain` — the leading-dot cookie domain that gates scraping
- `authCookies(name)` — which cookie name(s) prove a signed-in session
- `handleFromPath(segments)` — optional, parse an account handle from a profile
  URL (only for sources with account/list sync)
- `probeExpression` — optional, in-page JS that returns the signed-in handle
- `tests` — embedded test cases (yt-dlp `_TESTS` style)
- `suitable(url)` and `extract(input)` — the matcher and the extraction itself

### 3. Register it (one typed line)

Add the instance to `EXTRACTORS` in
`apps/desktop/src/main/core/pipeline/extractors/index.ts`. The record is
`satisfies Record<ExternalSource, Extractor>`, so a missing source is a compile
error.

### 4. Fill the compiler-forced registries

Because several registries are total `Record<Source, …>`, the compiler will
list exactly what's missing after you add the source. Fill each:

| File | What to add |
| --- | --- |
| `apps/desktop/src/renderer/src/features/sources/lib/registry.ts` | `SOURCE_LOGOS` — a brand icon (add the SVG to `@pond/icons` first) |
| `apps/desktop/src/main/core/pipeline/specs.ts` | `CAPTURE_EXPECTATIONS` — required/recommended capture fields |
| `apps/desktop/src/main/core/refresh/harvest/index.ts` | `REGISTRY` — a `Harvester` (copy the throwing `local` entry if the source has no list sync) |
| `apps/desktop/src/main/core/refresh/harvest-window/pool.ts` | `PER_SOURCE_CAP` — concurrent harvest-window cap |
| `apps/desktop/src/main/core/sync/index.ts` | `SYNC_WATCHDOG_MS` — per-source sync watchdog timeout |

### 5. Tests

Offline tests (`pnpm test`) run a generic harness over every extractor's
embedded `tests`: URL routing, `source_id` parsing, and `handleFromPath`
parsing, plus registry/descriptor totality. They gate PR CI.

### 6. Docs

`pnpm generate` rewrites [`docs/supported-sources.md`](docs/supported-sources.md)
from the descriptors. CI runs `pnpm generate && git diff --exit-code`, so a
forgotten regenerate is a red build — never hand-edit that file.

### 7. Optional extras

- **List sync / harvest**: a real `core/refresh/harvest/<id>/` adapter if the
  source supports syncing a user's saved list. Set `sync: { strategy }` on the
  descriptor (see "Sync + rate limiting" above) so the engine early-stops and
  the governor paces requests safely.
- **Extension capture**: entrypoints under `apps/extension/sources/` if the
  browser extension should capture this source directly.

> **A note on responsibility.** Pond's source adapters run entirely through the
> user's own authenticated browser session on their own machine — there are no
> Pond-operated scraping servers and no credentials leave the device. The rate
> governor exists to respect each platform's limits. When adding a source, keep
> the conservative pacing and remember that users are responsible for their own
> use under each platform's terms of service. See the
> [README "How sourcing works"](README.md#how-sourcing-works-and-your-responsibility)
> note for the user-facing version of this boundary, and
> [`core/sync/README.md`](apps/desktop/src/main/core/sync/README.md) +
> [`core/refresh/README.md`](apps/desktop/src/main/core/refresh/README.md) for
> how the governor, watermark cursors, and ingest path fit together.
