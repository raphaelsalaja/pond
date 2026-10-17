# @pond/desktop

The Pond desktop app: a local-first archive that runs in the background,
owns a SQLite index + filesystem library folder, and accepts saves from
the browser extension over native messaging.

## Scripts

Run these commands from `apps/desktop`, or prefix them at the repository root with `pnpm --filter @pond/desktop`.

| Script | What it does |
|---|---|
| `pnpm dev` | Launch Electron + Vite renderer in dev mode |
| `pnpm typecheck` | Regenerate TanStack routes and check main, preload, and renderer types |
| `pnpm test` | Run offline desktop tests |
| `pnpm build` | Build main/preload/renderer into `out/` |
| `pnpm dist:mac` | Build + package macOS DMG (arm64 + x64) |
| `pnpm dist:win` | Build + package the Windows x64 NSIS installer (run on Windows) |
| `pnpm rebuild` | Rebuild `better-sqlite3` for the current Electron ABI |
| `pnpm db:generate` | Generate Drizzle SQLite migrations |

## On disk

- **App state**: Electron’s `userData` directory (`~/Library/Application Support/Pond` on macOS, `%APPDATA%\Pond` on Windows) holds `global.db`, `config.json`, and encrypted secrets. Per-library indexes live at `indexes/<libraryId>.db`; thumbnail derivatives live at `pond-cache/thumbs/<libraryId>/`. See [`src/main/paths.ts`](src/main/paths.ts) for the platform-resolved paths.
- **Library** (source of truth): `~/Pond/My Pond.pond/` on macOS and `%USERPROFILE%\Pond\My Pond.pond` on Windows (per-item `.info` folders, trash, library metadata). On macOS the `.pond` folder is registered as a package, so Finder shows it as one file; on Windows it is an ordinary folder.
- **Secrets**: ingest token encrypted via Electron's `safeStorage`
  (macOS Keychain, Windows DPAPI, libsecret on Linux) and persisted to
  `secrets.json` in the app data directory.

The per-library index is rebuildable from the library. Global app state and encrypted secrets have separate lifecycles; do not treat the whole app data directory as a disposable index.

## Architecture

Main owns persistence and background operations under `src/main/core/`. The renderer save pool under `src/renderer/src/features/saves/state/` supports optimistic updates; main commits transactions to the library and database.

Renderer code is grouped into product features. `app` composes windows and features; `shared` holds reusable controls and infrastructure. TanStack route definitions remain under `routes` and their generated tree stays at the renderer root. Preload exposes the typed desktop query and event contracts.

Read the [architecture guide](../../docs/contributing/architecture.md), [code standards](../../docs/contributing/code-standards.md), and [contributor workflow](../../CONTRIBUTING.md) before changing ownership or adding an operation. From the repository root, run `pnpm check` and `pnpm build` before submitting a PR.
